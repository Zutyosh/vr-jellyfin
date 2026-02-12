// src/webserver/index.ts

import express from "express";
import http from "http";
import ProxyManager from "../jellyfin/proxy/proxyManager";
import { client } from "../jellyfin";
import { ProxyOptions, SubtitleMethod } from "../jellyfin/proxy/proxy";
import path from "path";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the React app
app.use("/assets", express.static("dist/client")); // Vite builds assets to dist/client
app.use(express.static("dist/client"));

// API Endpoints

// Get User Views (Libraries)
app.get("/api/views", async (req, res) => {
    try {
        const items = await client.getUserViews();
        res.json(items);
    } catch (error) {
        console.error("Error fetching views:", error);
        res.status(500).json({ error: "Failed to fetch views" });
    }
});

// Get Items (Children of a folder)
app.get("/api/items", async (req, res) => {
    const parentId = req.query.parentId as string;
    if (!parentId) {
        return res.status(400).json({ error: "parentId is required" });
    }
    try {
        const items = await client.getItems(parentId);
        res.json(items);
    } catch (error) {
        console.error("Error fetching items:", error);
        res.status(500).json({ error: "Failed to fetch items" });
    }
});

// Get Item Details
app.get("/api/item/:id", async (req, res) => {
    const itemId = req.params.id;
    try {
        const item = await client.getItem(itemId);
        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }
        res.json(item);
    } catch (error) {
        console.error("Error fetching item:", error);
        res.status(500).json({ error: "Failed to fetch item" });
    }
});

// Image Proxy
// Supports /api/image/:id (Primary) or /api/image/:id/:type/:index
app.get(["/api/image/:id", "/api/image/:id/:type", "/api/image/:id/:type/:index"], async (req, res) => {
    const itemId = req.params.id;
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
        console.error("Error proxing image:", error);
        res.status(500).send("Image proxy failed");
    }
});

// Create Proxy (Generate Stream Link)
app.post("/api/proxy/:id", async (req, res) => {
    const itemId = req.params.id;
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
    try {
        const streams = await client.getMediaStreams(itemId);
        res.json(streams);
    } catch (error) {
        console.error('Error fetching media streams:', error);
        res.status(500).json({ error: 'Failed to fetch media streams.' });
    }
});

// Download Playlist (M3U)
app.get("/api/playlist/:id.m3u", async (req, res) => {
    const albumId = req.params.id;

    try {
        // 1. Get album tracks
        const tracks = await client.getItems(albumId);

        // Filter for audio only (just in case) and sort by IndexNumber
        const audioTracks = tracks
            .filter(t => t.Type === 'Audio' && t.Id) // Ensure Id exists
            .sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));

        if (audioTracks.length === 0) {
            return res.status(404).send("#EXTM3U\n# No tracks found");
        }

        // 2. Generate M3U Content
        let m3uContent = "#EXTM3U\n";
        const host = req.get('host');
        const protocol = req.protocol;

        for (const track of audioTracks) {
            if (!track.Id) continue; // Should be handled by filter but for TS safety
            const proxy = ProxyManager.createProxy(track.Id);

            const durationSec = track.RunTimeTicks ? Math.floor(track.RunTimeTicks / 10000000) : -1;
            const title = `${track.Artists?.join(', ') || 'Unknown'} - ${track.Name}`;

            m3uContent += `#EXTINF:${durationSec},${title}\n`;
            m3uContent += `${protocol}://${host}/v/${proxy.id}\n`;
        }

        // 3. Send Response
        res.setHeader('Content-Type', 'application/x-mpegurl');
        res.setHeader('Content-Disposition', `attachment; filename="playlist_${albumId}.m3u"`);
        res.send(m3uContent);

    } catch (error) {
        console.error("Error generating playlist:", error);
        res.status(500).send("Failed to generate playlist");
    }
});


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
            console.error(`Jellyfin stream fetch failed:`, {
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
        console.log(`Piping stream to client with options:`, options);
    } catch (err: any) {
        const errorMessage = (err.message || err.toString()).replace(/api_key=[a-zA-Z0-9]+/, "api_key=REDACTED");
        console.error('Error in /v/:id route:', errorMessage);
        res.status(500).send('Internal server error while proxying video stream.');
    }
});


// Fallback to index.html for SPA (must be last)
app.get("*", (req, res) => {
    // Avoid intercepting API calls or specific routes
    if (req.path.startsWith('/api') || req.path.startsWith('/v/')) {
        return res.status(404).send("Not Found");
    }
    res.sendFile("index.html", { root: "dist/client" });
});


// Start Server
client.authenticate().then((success) => {
    if (!success) {
        console.error("Failed to authenticate with Jellyfin server");
        process.exit(1);
    }

    const server = http.createServer(app);
    const port = parseInt(process.env.WEBSERVER_PORT || "4000");

    server.listen(port, () => {
        console.log(`Webserver listening on port ${port}`);
    });
});
