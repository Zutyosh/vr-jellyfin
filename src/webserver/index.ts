// src/webserver/index.ts

import express from "express";
import http from "http";
import fs from "fs";
import { Readable } from "stream";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import ffmpegStatic from "ffmpeg-static";
import ProxyManager from "../jellyfin/proxy/proxyManager";
import { client } from "../jellyfin";
import { ProxyOptions, SubtitleMethod } from "../jellyfin/proxy/proxy";
import { log } from "../utils/logger";

// Set FFmpeg and FFprobe paths for fluent-ffmpeg
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// HLS Configuration
const HLS_CACHE_DIR = path.join(process.cwd(), 'cache', 'hls');
const HLS_SEGMENT_DURATION = 10; // seconds per segment
const FFMPEG_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes max for segmentation
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // every hour

// Lock mechanism to prevent race conditions on concurrent segmentation requests
const segmentationLocks = new Map<string, Promise<void>>();

const app = express();

// ── security headers ────────────────────────────────────────────────
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── optional basic auth ─────────────────────────────────────────────
const AUTH_USER = process.env.AUTH_USERNAME;
const AUTH_PASS = process.env.AUTH_PASSWORD;

if (AUTH_USER && AUTH_PASS) {
    log.info("Basic authentication enabled");

    app.use((req, res, next) => {
        // stream and playlist URLs must stay open for VR players
        if (req.path.startsWith("/v/") || req.path.startsWith("/playlist/")) return next();

        const header = req.headers.authorization;
        if (!header || !header.startsWith("Basic ")) {
            res.setHeader("WWW-Authenticate", 'Basic realm="vr-jellyfin"');
            return res.status(401).send("Authentication required");
        }

        const decoded = Buffer.from(header.slice(6), "base64").toString();
        const sep = decoded.indexOf(":");
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);

        if (user === AUTH_USER && pass === AUTH_PASS) return next();

        res.setHeader("WWW-Authenticate", 'Basic realm="vr-jellyfin"');
        return res.status(401).send("Invalid credentials");
    });
}

// ── rate limiting (in-memory, no deps) ──────────────────────────────
const hits = new Map<string, { count: number; expires: number }>();
const RATE_WINDOW = 60_000;
const RATE_MAX = 120;

// clean stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
        if (now > entry.expires) hits.delete(ip);
    }
}, 5 * 60_000);

app.use((req, res, next) => {
    if (req.path.startsWith("/v/") || req.path.startsWith("/playlist/")) return next();

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now > entry.expires) {
        hits.set(ip, { count: 1, expires: now + RATE_WINDOW });
        return next();
    }

    entry.count++;
    if (entry.count > RATE_MAX) {
        return res.status(429).send("Too many requests, slow down");
    }

    next();
});

// ── static files ────────────────────────────────────────────────────
app.use("/assets", express.static("dist/client")); // Vite builds assets to dist/client
app.use(express.static("dist/client"));

// ── validation helper ───────────────────────────────────────────────
const ITEM_ID_RE = /^[a-f0-9]{32}$/i;
function isValidId(id: string): boolean {
    return ITEM_ID_RE.test(id);
}

// ── routes ──────────────────────────────────────────────────────────

// Health check endpoint
app.get("/api/health", async (_req, res) => {
    try {
        const views = await client.getUserViews();
        res.json({ status: "ok", libraries: views.length });
    } catch {
        res.status(503).json({ status: "error", message: "Jellyfin unreachable" });
    }
});

// Get User Views (Libraries)
app.get("/api/views", async (_req, res) => {
    try {
        const items = await client.getUserViews();
        res.json(items);
    } catch (error) {
        log.error("Error fetching views:", error);
        res.status(500).json({ error: "Failed to fetch views" });
    }
});

// Get Items (Children of a folder or Search)
app.get("/api/items", async (req, res) => {
    try {
        // Only forward known query keys to Jellyfin
        const allowed = [
            "parentId", "ParentId", "searchTerm", "SearchTerm",
            "Recursive", "IncludeItemTypes",
        ];
        const safe: Record<string, any> = {};
        for (const key of allowed) {
            if (req.query[key] !== undefined) safe[key] = req.query[key];
        }

        const items = await client.getItems(safe);
        res.json(items);
    } catch (error) {
        log.error("Error fetching items:", error);
        res.status(500).json({ error: "Failed to fetch items" });
    }
});

// Get Item Details
app.get("/api/item/:id", async (req, res) => {
    const itemId = req.params.id;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    try {
        const item = await client.getItem(itemId);
        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }
        res.json(item);
    } catch (error) {
        log.error("Error fetching item:", error);
        res.status(500).json({ error: "Failed to fetch item" });
    }
});

// Image Proxy
// Supports /api/image/:id (Primary) or /api/image/:id/:type/:index
app.get(["/api/image/:id", "/api/image/:id/:type", "/api/image/:id/:type/:index"], async (req, res) => {
    const itemId = req.params.id;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    const imageType = req.params.type;
    const index = req.params.index ? parseInt(req.params.index) : undefined;

    try {
        const response = await client.getImage(itemId, imageType, index);
        if (!response.ok) {
            return res.status(response.status).send(response.statusText);
        }
        // Forward headers
        const contentType = response.headers.get("content-type");
        if (contentType) res.setHeader("Content-Type", contentType);
        const contentLength = response.headers.get("content-length");
        if (contentLength) res.setHeader("Content-Length", contentLength);
        const cacheControl = response.headers.get("cache-control");
        if (cacheControl) res.setHeader("Cache-Control", cacheControl);

        if (response.body) {
            response.body.pipe(res);
        } else {
            res.status(500).send("No image body");
        }
    } catch (error) {
        log.error("Error proxying image:", error);
        res.status(500).send("Image proxy failed");
    }
});

// Create Proxy (Generate Stream Link)
app.post("/api/proxy/:id", async (req, res) => {
    const itemId = req.params.id;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    const { subtitleStreamIndex, audioStreamIndex } = req.body;

    const proxyOptions: ProxyOptions = {};

    if (audioStreamIndex != null) {
        proxyOptions.audioStreamIndex = audioStreamIndex;
    }

    if (subtitleStreamIndex != null && subtitleStreamIndex > 0) {
        proxyOptions.subtitleStreamIndex = subtitleStreamIndex;
        proxyOptions.subtitleMethod = SubtitleMethod.Encode;
    }

    const proxy = ProxyManager.createProxy(itemId, proxyOptions);

    // Construct the stream URL that the client will use
    const host = req.get('host');
    const protocol = req.protocol;
    const streamUrl = `${protocol}://${host}/v/${proxy.id}`;

    res.json({
        id: proxy.id,
        streamUrl: streamUrl
    });
});

// Get Media Streams (Audio & Subtitles)
app.get("/api/streams/:itemId", async (req, res) => {
    const itemId = req.params.itemId;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    try {
        const streams = await client.getMediaStreams(itemId);
        res.json(streams);
    } catch (error) {
        log.error('Error fetching media streams:', error);
        res.status(500).json({ error: 'Failed to fetch media streams.' });
    }
});

// ========================
// HLS Streaming Routes
// ========================

// HLS Master Playlist – lists all tracks in an album
app.get('/playlist/:albumId.m3u8', async (req, res) => {
    const { albumId } = req.params;

    // Validate albumId format (Jellyfin UUIDs are 32 hex chars)
    if (!isValidId(albumId)) {
        return res.status(400).json({ error: 'Invalid album ID' });
    }

    try {
        const tracks = await client.getItems({ ParentId: albumId });

        const audioTracks = tracks
            .filter(t => t.Type === 'Audio' && t.Id)
            .sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));

        if (audioTracks.length === 0) {
            return res.status(404).json({ error: 'No audio tracks found' });
        }

        // Build absolute base URL (force HTTPS for non-localhost deployments)
        const host = req.get('host') || 'localhost:4000';
        const protocol = (host === 'localhost' || host.startsWith('localhost:'))
            ? req.protocol
            : 'https';
        const baseUrl = `${protocol}://${host}`;

        // Build HLS Master Playlist (RFC 8216)
        let playlist = '#EXTM3U\n';
        playlist += '#EXT-X-VERSION:3\n';
        playlist += '#EXT-X-PLAYLIST-TYPE:VOD\n\n';

        for (const track of audioTracks) {
            const durationSec = track.RunTimeTicks
                ? Math.ceil(track.RunTimeTicks / 10_000_000)
                : 0;
            const title = `${track.Artists?.join(', ') || 'Unknown'} - ${track.Name}`;
            playlist += `#EXTINF:${durationSec},${title}\n`;
            playlist += `${baseUrl}/playlist/track/${track.Id}/index.m3u8\n`;
        }

        playlist += '#EXT-X-ENDLIST\n';

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(playlist);
    } catch (error) {
        log.error('[HLS] Error generating master playlist:', error);
        res.status(500).json({ error: 'Failed to generate playlist' });
    }
});


// HLS Track Playlist – generates segments for a single track via FFmpeg
app.get('/playlist/track/:trackId/index.m3u8', async (req, res) => {
    const { trackId } = req.params;

    // Validate trackId format
    if (!isValidId(trackId)) {
        return res.status(400).json({ error: 'Invalid track ID' });
    }

    const cacheDir = path.join(HLS_CACHE_DIR, trackId);
    const playlistPath = path.join(cacheDir, 'index.m3u8');

    // Build absolute base URL for segment references
    const host = req.get('host') || 'localhost:4000';
    const protocol = (host === 'localhost' || host.startsWith('localhost:'))
        ? req.protocol
        : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Helper: read FFmpeg-generated M3U8 and rewrite relative segment paths to absolute URLs
    const serveRewrittenPlaylist = () => {
        let content = fs.readFileSync(playlistPath, 'utf-8');
        // Replace relative segment filenames (e.g. "segment000.ts") with absolute URLs
        content = content.replace(
            /^(segment\d{3}\.ts)$/gm,
            `${baseUrl}/playlist/track/${trackId}/$1`
        );
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(content);
    };

    // 1. Cache hit – serve immediately (with rewritten URLs)
    if (fs.existsSync(playlistPath)) {
        return serveRewrittenPlaylist();
    }

    // 2. Another request is already generating this track – wait for it
    if (segmentationLocks.has(trackId)) {
        try {
            await segmentationLocks.get(trackId);
            if (fs.existsSync(playlistPath)) {
                return serveRewrittenPlaylist();
            }
            return res.status(500).json({ error: 'Segmentation completed but playlist not found' });
        } catch {
            return res.status(500).json({ error: 'Segmentation failed (waited on lock)' });
        }
    }

    // 3. Generate segments with FFmpeg
    try {
        // Create cache directory
        fs.mkdirSync(cacheDir, { recursive: true });

        // Get the Jellyfin audio stream URL
        const jellyfinUrl = client.serverUrl;
        const apiKey = client.apiKey;
        const streamUrl = `${jellyfinUrl}/Audio/${trackId}/stream?api_key=${apiKey}&static=true`;

        log.info(`[HLS] Starting segmentation for track ${trackId}`);

        const segmentationPromise = new Promise<void>(async (resolve, reject) => {
            let timedOut = false;

            // Timeout protection
            const timeout = setTimeout(() => {
                timedOut = true;
                log.error(`[FFmpeg] Timeout for track ${trackId} after ${FFMPEG_TIMEOUT_MS}ms`);
                // Clean up partial files
                if (fs.existsSync(cacheDir)) {
                    fs.rmSync(cacheDir, { recursive: true, force: true });
                }
                reject(new Error('FFmpeg timeout'));
            }, FFMPEG_TIMEOUT_MS);

            try {
                // Fetch audio stream via Node.js (bypasses ffmpeg-static HTTPS/TLS issues)
                const fetchResponse = await fetch(streamUrl, {
                    headers: { 'User-Agent': 'vr-jellyfin HLS Proxy' },
                    // @ts-ignore - timeout option
                    timeout: 60_000,
                });

                if (!fetchResponse.ok || !fetchResponse.body) {
                    clearTimeout(timeout);
                    reject(new Error(`Jellyfin stream fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`));
                    return;
                }

                log.info(`[HLS] Stream fetched for ${trackId}, piping to FFmpeg via stdin`);

                // Convert Web ReadableStream to Node.js Readable for fluent-ffmpeg
                const nodeStream = Readable.fromWeb(fetchResponse.body as any);

                // Pipe fetched stream to FFmpeg stdin instead of passing URL directly
                ffmpeg()
                    .input(nodeStream)
                    .inputOptions([
                        '-probesize', '5000000',         // 5MB probe for format detection on pipe
                        '-analyzeduration', '10000000',  // 10s analysis window
                    ])
                    .outputOptions([
                        '-vn',              // Strip embedded album art / cover images
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-ac', '2',
                        '-f', 'hls',
                        '-hls_time', String(HLS_SEGMENT_DURATION),
                        '-hls_list_size', '0',
                        '-hls_segment_filename', path.join(cacheDir, 'segment%03d.ts'),
                    ])
                    .output(playlistPath)
                    .on('start', (cmdline) => {
                        log.info(`[FFmpeg] Command: ${cmdline}`);
                    })
                    .on('progress', (progress) => {
                        if (progress.percent) {
                            log.info(`[FFmpeg] ${trackId}: ${Math.round(progress.percent)}%`);
                        }
                    })
                    .on('end', () => {
                        clearTimeout(timeout);
                        if (!timedOut) {
                            log.info(`[HLS] Segmentation complete for track ${trackId}`);
                            resolve();
                        }
                    })
                    .on('error', (err: Error, _stdout: string, stderr: string) => {
                        clearTimeout(timeout);
                        if (!timedOut) {
                            log.error(`[FFmpeg] Error for track ${trackId}: ${err.message}`);
                            log.error(`[FFmpeg] stderr: ${stderr}`);
                            if (fs.existsSync(cacheDir)) {
                                fs.rmSync(cacheDir, { recursive: true, force: true });
                            }
                            reject(err);
                        }
                    })
                    .run();
            } catch (fetchErr: any) {
                clearTimeout(timeout);
                log.error(`[HLS] Failed to fetch stream for ${trackId}: ${fetchErr.message}`);
                reject(fetchErr);
            }
        });

        segmentationLocks.set(trackId, segmentationPromise);

        await segmentationPromise;
        segmentationLocks.delete(trackId);

        serveRewrittenPlaylist();
    } catch (error: any) {
        segmentationLocks.delete(trackId);
        log.error('[HLS] Segmentation error:', error.message || error);
        res.status(500).json({ error: 'Segmentation failed', details: error.message });
    }
});


// HLS Segment Serving – serves individual .ts segment files
app.get('/playlist/track/:trackId/:segment', (req, res) => {
    const { trackId, segment } = req.params;

    // Path traversal protection: validate trackId (Jellyfin UUID)
    if (!isValidId(trackId)) {
        return res.status(400).json({ error: 'Invalid track ID' });
    }

    // Validate segment filename: must match segmentNNN.ts
    if (!/^segment\d{3}\.ts$/.test(segment)) {
        return res.status(400).json({ error: 'Invalid segment name' });
    }

    const segmentPath = path.join(HLS_CACHE_DIR, trackId, segment);

    // Double-check: resolved path must stay within cache root
    const resolvedPath = path.resolve(segmentPath);
    const resolvedCacheRoot = path.resolve(HLS_CACHE_DIR);
    if (!resolvedPath.startsWith(resolvedCacheRoot)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (fs.existsSync(segmentPath)) {
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(resolvedPath);
    } else {
        res.status(404).json({ error: 'Segment not found' });
    }
});


// HLS Cache Cleanup – removes segments older than 24 hours
function cleanupHlsCache() {
    if (!fs.existsSync(HLS_CACHE_DIR)) return;

    const now = Date.now();
    try {
        const trackDirs = fs.readdirSync(HLS_CACHE_DIR);
        for (const trackId of trackDirs) {
            const trackDir = path.join(HLS_CACHE_DIR, trackId);
            try {
                const stat = fs.statSync(trackDir);
                if (stat.isDirectory() && (now - stat.mtimeMs > CACHE_MAX_AGE_MS)) {
                    fs.rmSync(trackDir, { recursive: true, force: true });
                    log.info(`[HLS Cache] Cleaned track ${trackId}`);
                }
            } catch {
                // Ignore individual errors during cleanup
            }
        }
    } catch (err) {
        log.error('[HLS Cache] Cleanup error:', err);
    }
}

// Run cache cleanup on an interval (no extra dependency needed)
setInterval(cleanupHlsCache, CACHE_CLEANUP_INTERVAL_MS);


// Video Stream Endpoint (The actual proxy)
app.get("/v/:id", async (req, res) => {
    const proxy = ProxyManager.getProxy(req.params.id);

    if (!proxy) {
        res.status(404).send("Proxy not found, is your url valid?");
        return;
    }

    const itemId = proxy.itemId;
    const options = proxy.options;

    try {
        const response = await client.getStream(itemId!, proxy.id, options);
        if (!response.ok || !response.body) {
            const errorText = await response.text();
            log.error(`Jellyfin stream fetch failed:`, {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                bodySnippet: errorText.slice(0, 200)
            });
            res.status(502).send("Failed to fetch video stream from Jellyfin.");
            return;
        }
        // Set headers from Jellyfin response
        for (const [key, value] of response.headers.entries()) {
            if (key.toLowerCase() === 'transfer-encoding') continue; // skip problematic headers
            res.setHeader(key, value);
        }
        response.body.pipe(res);
        log.info(`Piping stream to client with options:`, options);
    } catch (err: any) {
        const errorMessage = (err.message || err.toString()).replace(/api_key=[a-zA-Z0-9]+/, "api_key=REDACTED");
        log.error('Error in /v/:id route:', errorMessage);
        res.status(500).send('Internal server error while proxying video stream.');
    }
});


// Fallback to index.html for SPA (must be last)
app.get("*", (req, res) => {
    // Avoid intercepting API calls or specific routes
    if (req.path.startsWith('/api') || req.path.startsWith('/v/') || req.path.startsWith('/playlist/')) {
        return res.status(404).send("Not Found");
    }
    res.sendFile("index.html", { root: "dist/client" });
});


// Start Server
client.authenticate().then((success) => {
    if (!success) {
        log.error("Failed to authenticate with Jellyfin server");
        process.exit(1);
    }

    const server = http.createServer(app);
    const port = parseInt(process.env.WEBSERVER_PORT || "4000");

    server.listen(port, () => {
        log.info(`Webserver listening on port ${port}`);
    });
});
