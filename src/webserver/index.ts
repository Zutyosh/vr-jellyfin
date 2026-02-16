import express from "express";
import http from "http";
import ProxyManager from "../jellyfin/proxy/proxyManager";
import { client } from "../jellyfin";
import { ProxyOptions, SubtitleMethod } from "../jellyfin/proxy/proxy";
<<<<<<< Updated upstream
=======
import { log } from "../utils/logger";
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
app.use("/assets", express.static("dist/client"));

// Serve the index.html file from the correct directory
app.get("/", (req, res) => {
    res.sendFile("index.html", { root: "dist/client" });
});

// Endpoint to fetch playable media
app.get("/i", async (req, res) => {
    const items = await client.getPlayableMedia();
    res.json(items);
});

// Endpoint to create a proxy with subtitle options
app.post("/i/:id", async (req, res) => {
    const itemId = req.params.id;
    const { subtitleStreamIndex } = req.body;
=======
// ── optional basic auth ─────────────────────────────────────────────
const AUTH_USER = process.env.AUTH_USERNAME;
const AUTH_PASS = process.env.AUTH_PASSWORD;

if (AUTH_USER && AUTH_PASS) {
    log.info("Basic authentication enabled");

    app.use((req, res, next) => {
        // stream URLs must stay open for VR players
        if (req.path.startsWith("/v/")) return next();

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
    if (req.path.startsWith("/v/")) return next();

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
app.use("/assets", express.static("dist/client"));
app.use(express.static("dist/client"));

// ── validation helper ───────────────────────────────────────────────
const ITEM_ID_RE = /^[a-f0-9]{32}$/i;
function isValidId(id: string): boolean {
    return ITEM_ID_RE.test(id);
}

// ── routes ──────────────────────────────────────────────────────────

app.get("/api/health", async (_req, res) => {
    try {
        const views = await client.getUserViews();
        res.json({ status: "ok", libraries: views.length });
    } catch {
        res.status(503).json({ status: "error", message: "Jellyfin unreachable" });
    }
});

app.get("/api/views", async (_req, res) => {
    try {
        const items = await client.getUserViews();
        res.json(items);
    } catch (error) {
        log.error("Error fetching views:", error);
        res.status(500).json({ error: "Failed to fetch views" });
    }
});

app.get("/api/items", async (req, res) => {
    try {
        // only forward known query keys to Jellyfin
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

app.get("/api/item/:id", async (req, res) => {
    const itemId = req.params.id;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    try {
        const item = await client.getItem(itemId);
        if (!item) return res.status(404).json({ error: "Item not found" });
        res.json(item);
    } catch (error) {
        log.error("Error fetching item:", error);
        res.status(500).json({ error: "Failed to fetch item" });
    }
});

app.get(
    ["/api/image/:id", "/api/image/:id/:type", "/api/image/:id/:type/:index"],
    async (req, res) => {
        const itemId = req.params.id;
        if (!isValidId(itemId)) return res.status(400).send("Invalid item ID");

        const imageType = req.params.type;
        const index = req.params.index ? parseInt(req.params.index, 10) : undefined;

        try {
            const response = await client.getImage(itemId, imageType, index);
            if (!response.ok) {
                return res.status(response.status).send(response.statusText);
            }

            const ct = response.headers.get("content-type");
            if (ct) res.setHeader("Content-Type", ct);

            const cl = response.headers.get("content-length");
            if (cl) res.setHeader("Content-Length", cl);

            // cache images for 1 hour
            res.setHeader("Cache-Control", "public, max-age=3600");

            if (response.body) {
                response.body.pipe(res);
            } else {
                res.status(500).send("No image body");
            }
        } catch (error) {
            log.error("Error proxying image:", error);
            res.status(500).send("Image proxy failed");
        }
    }
);

app.post("/api/proxy/:id", async (req, res) => {
    const itemId = req.params.id;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });
>>>>>>> Stashed changes

    const { subtitleStreamIndex, audioStreamIndex } = req.body;
    const opts: ProxyOptions = {};

<<<<<<< Updated upstream
    if (subtitleStreamIndex != null) {
        proxyOptions.subtitleStreamIndex = subtitleStreamIndex;
        proxyOptions.subtitleMethod = SubtitleMethod.Encode;
    }

    const proxy = ProxyManager.createProxy(itemId, proxyOptions);
    res.json({
        id: proxy.id,
    });
});

// Endpoint to fetch subtitle streams
app.get("/subtitles/:itemId", async (req, res) => {
=======
    if (audioStreamIndex != null) {
        const idx = Number(audioStreamIndex);
        if (!Number.isInteger(idx) || idx < 0) {
            return res.status(400).json({ error: "Invalid audio stream index" });
        }
        opts.audioStreamIndex = idx;
    }

    if (subtitleStreamIndex != null && Number(subtitleStreamIndex) > 0) {
        const idx = Number(subtitleStreamIndex);
        if (!Number.isInteger(idx)) {
            return res.status(400).json({ error: "Invalid subtitle stream index" });
        }
        opts.subtitleStreamIndex = idx;
        opts.subtitleMethod = SubtitleMethod.Encode;
    }

    const proxy = ProxyManager.createProxy(itemId, opts);
    const host = req.get("host");
    const protocol = req.protocol;

    res.json({
        id: proxy.id,
        streamUrl: `${protocol}://${host}/v/${proxy.id}`,
    });
});

app.get("/api/streams/:itemId", async (req, res) => {
>>>>>>> Stashed changes
    const itemId = req.params.itemId;
    if (!isValidId(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    try {
        const subtitleStreams = await client.getSubtitleStreams(itemId);
        res.json({ subtitleStreams });
    } catch (error) {
<<<<<<< Updated upstream
        console.error('Error fetching subtitle streams:', error);
        res.status(500).json({ error: 'Failed to fetch subtitle streams.' });
    }
});

// Endpoint to stream video with subtitle options
=======
        log.error("Error fetching media streams:", error);
        res.status(500).json({ error: "Failed to fetch media streams" });
    }
});

app.get("/v/playlist/:id.m3u", async (req, res) => {
    const albumId = req.params.id;
    if (!isValidId(albumId)) return res.status(400).send("Invalid album ID");

    try {
        const tracks = await client.getItems({ ParentId: albumId });
        const audio = tracks
            .filter((t) => t.Type === "Audio" && t.Id)
            .sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));

        if (audio.length === 0) {
            return res.status(404).send("#EXTM3U\n# No tracks found");
        }

        const host = req.get("host");
        const protocol = req.protocol;

        let m3u = "#EXTM3U\n";
        for (const track of audio) {
            if (!track.Id) continue;
            const proxy = ProxyManager.createProxy(track.Id);
            const sec = track.RunTimeTicks
                ? Math.floor(track.RunTimeTicks / 10_000_000)
                : -1;
            const title = `${track.Artists?.join(", ") || "Unknown"} - ${track.Name}`;
            m3u += `#EXTINF:${sec},${title}\n`;
            m3u += `${protocol}://${host}/v/${proxy.id}\n`;
        }

        res.setHeader("Content-Type", "application/x-mpegurl");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="playlist_${albumId}.m3u"`
        );
        res.send(m3u);
    } catch (error) {
        log.error("Error generating playlist:", error);
        res.status(500).send("Failed to generate playlist");
    }
});

>>>>>>> Stashed changes
app.get("/v/:id", async (req, res) => {
    const proxy = ProxyManager.getProxy(req.params.id);
    if (!proxy) {
        return res.status(404).send("Proxy not found, is your URL valid?");
    }

    try {
<<<<<<< Updated upstream
        const response = await client.getVideoStream(itemId!, options);
=======
        const response = await client.getStream(proxy.itemId, proxy.id, proxy.options);

>>>>>>> Stashed changes
        if (!response.ok || !response.body) {
            const body = await response.text();
            log.error("Stream fetch failed:", {
                status: response.status,
                statusText: response.statusText,
                snippet: body.slice(0, 200),
            });
            return res.status(502).send("Failed to fetch stream from Jellyfin");
        }

        for (const [key, value] of response.headers.entries()) {
            if (key.toLowerCase() === "transfer-encoding") continue;
            res.setHeader(key, value);
        }

        response.body.pipe(res);
<<<<<<< Updated upstream
        console.log(`Piping stream to client with options:`, options);
    } catch (err) {
        console.error('Error in /v/:id route:', err);
        res.status(500).send('Internal server error while proxying video stream.');
    }
});

// Start the server after Jellyfin client authentication
=======
        log.info(`Streaming proxy ${proxy.id} for item ${proxy.itemId}`);
    } catch (err: any) {
        log.error("Stream proxy error:", err.message || err);
        res.status(500).send("Internal server error while proxying stream");
    }
});

// SPA fallback — must be last
app.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/v/")) {
        return res.status(404).send("Not Found");
    }
    res.sendFile("index.html", { root: "dist/client" });
});

// ── startup ─────────────────────────────────────────────────────────
let server: http.Server;

>>>>>>> Stashed changes
client.authenticate().then((success) => {
    if (!success) {
        log.error("Failed to authenticate with Jellyfin");
        process.exit(1);
    }

    ProxyManager.init();

    const port = parseInt(process.env.WEBSERVER_PORT || "4000", 10);
    server = http.createServer(app);

    server.listen(port, () => {
        log.info(`Server listening on port ${port}`);
    });
});

// ── graceful shutdown ───────────────────────────────────────────────
function shutdown() {
    log.info("Shutting down...");

    if (server) {
        server.close(() => {
            log.info("Server closed");
            process.exit(0);
        });
    }

    // force exit after 10 seconds if connections hang
    setTimeout(() => {
        log.warn("Forced shutdown after timeout");
        process.exit(1);
    }, 10_000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
