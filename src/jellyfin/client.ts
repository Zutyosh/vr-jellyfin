// src/jellyfin/client.ts

import { Api, Jellyfin } from "@jellyfin/sdk";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api/user-views-api";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import fetch from "node-fetch";
import { resolve } from "path";
import { ProxyOptions, SubtitleMethod } from "./proxy/proxy"; // Added import
import * as http from "http";
import * as https from "https";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const encodingSettings: Record<string, string> = require(resolve("./encodingSettings.js")).encodingSettings;

export default class JellyfinClient {
    public static readonly APP_NAME = "Jellyfin VRChat Proxy (jellyfin-vrchat)";

    private _sdk: Jellyfin;
    private _api: Api;

    public userId?: string;

    constructor(public serverUrl: string, private username: string, private password: string) {
        // Ensure the serverUrl does not end with a slash
        this.serverUrl = serverUrl.replace(/\/+$/, "");

        this._sdk = new Jellyfin({
            clientInfo: {
                name: JellyfinClient.APP_NAME,
                version: process.env.npm_package_version || "0.0.0",
            },
            deviceInfo: {
                name: `${JellyfinClient.APP_NAME} ${process.env.npm_package_version || "0.0.0"} | ${process.platform} | ${process.arch}`,
                id: "jellyfin-vrchat",
            },
        });

        this._api = this._sdk.createApi(this.serverUrl);
    }

    public get apiKey() {
        return this._api.accessToken;
    }

    public async authenticate() {
        const auth = await this._api.authenticateUserByName(this.username, this.password).catch((e) => {
            console.error("Failed to authenticate with Jellyfin, check your username and password", e);
            process.exit(1);
        });

        this.userId = auth.data.User?.Id;
        return auth.status == 200;
    }

    public async getUserViews() {
        const viewsResponse = await getUserViewsApi(this._api).getUserViews({
            userId: this.userId!,
        });
        return viewsResponse.data.Items || [];
    }

    public async getItems(parentId: string) {
        const itemsResponse = await getItemsApi(this._api).getItems({
            userId: this.userId!,
            parentId: parentId,
            fields: ["AlbumArtist", "Artists"] as any,
        });

        const items = itemsResponse.data.Items || [];
        // Filter out missing or virtual items
        return items.filter((item: any) => {
            if (item.LocationType === 'Virtual') return false;
            // SDK might not have IsMissing on BaseItemDto strictly typed depending on version, check existence
            if (item.IsMissing === true) return false;
            return true;
        });
    }

    public async getItem(itemId: string) {
        const itemsResponse = await getItemsApi(this._api).getItems({
            userId: this.userId!,
            ids: [itemId],
            fields: ["AlbumArtist", "Artists", "MediaSources"] as any,
        });
        return itemsResponse.data.Items?.[0];
    }

    public async getImage(itemId: string, imageType: string = "Primary", index?: number) {
        let url = `${this.serverUrl}/Items/${itemId}/Images/${imageType}`;
        if (index !== undefined) {
            url += `/${index}`;
        }

        const response = await fetch(url, {
            headers: {
                "User-Agent": JellyfinClient.APP_NAME,
                "X-Emby-Token": this.apiKey // Important for authorization if needed for some images
            },
        });
        return response;
    }

    public async getStream(itemId: string, proxyId: string, options?: ProxyOptions) {
        // 1. Get Item Type to distinguish Audio vs Video
        const item = await this.getItem(itemId);
        const isAudio = item?.Type === 'Audio';
        const mediaSourceId = item?.MediaSources?.[0]?.Id;

        let url: URL;

        if (isAudio) {
            // Audio Logic
            url = new URL(`${this.serverUrl}/Audio/${itemId}/stream`);
            url.searchParams.set("api_key", this.apiKey);
            if (mediaSourceId) {
                url.searchParams.set("MediaSourceId", mediaSourceId);
            }

            // Audio-specific parameters
            url.searchParams.set("static", "true");
            url.searchParams.set("container", "mp3");
            url.searchParams.set("audioCodec", "mp3");
            // Explicitly ensuring no video params are added
        } else {
            // Video Logic (Default)
            url = new URL(`${this.serverUrl}/Videos/${itemId}/stream`);
            url.searchParams.set("api_key", this.apiKey);
            if (mediaSourceId) {
                url.searchParams.set("MediaSourceId", mediaSourceId);
            }

            // Default encoding settings
            url.searchParams.set("container", "mp4");
            url.searchParams.set("audioCodec", "aac");
            url.searchParams.set("videoCodec", "h264");

            // Override encoding settings if provided
            for (const [k, v] of Object.entries(encodingSettings)) {
                url.searchParams.set(k, v);
            }

            if (options?.audioStreamIndex !== undefined) {
                url.searchParams.set("AudioStreamIndex", options.audioStreamIndex.toString());
            }

            // Include subtitle parameters if provided
            if (options?.subtitleStreamIndex !== undefined) {
                url.searchParams.set("SubtitleMethod", options.subtitleMethod || SubtitleMethod.Encode);
                // url.searchParams.set("SubtitleCodec", "srt"); // Removed to fix PGS subtitle crash
                url.searchParams.set("SubtitleStreamIndex", options.subtitleStreamIndex.toString());
            }
        }

        // Force unique session per proxy instance
        url.searchParams.set("PlaySessionId", proxyId);
        url.searchParams.set("DeviceId", `jellyfin-vrchat-${proxyId}`);

        // Log Redaction
        const logUrl = new URL(url.toString());
        logUrl.searchParams.set("api_key", "REDACTED");
        console.log(`Requesting stream from ${logUrl.toString()}`);

        const response = await fetch(url.toString(), {
            headers: {
                "User-Agent": JellyfinClient.APP_NAME,
            },
            agent: (parsedUrl) => {
                if (parsedUrl.protocol === 'http:') {
                    return httpAgent;
                } else {
                    return httpsAgent;
                }
            },
            timeout: 0, // Disable timeout to allow long transcoding pre-rolls
        });

        return response;
    }

    // New method to fetch available subtitle streams
    // Fetch available media streams (Audio & Subtitles)
    public async getMediaStreams(itemId: string) {
        const url = `${this.serverUrl}/Items/${itemId}?Fields=MediaStreams&api_key=${this.apiKey}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": JellyfinClient.APP_NAME,
            },
        });
        const data = await response.json();
        const streams = data.MediaStreams || [];
        return {
            audio: streams.filter((s: any) => s.Type === 'Audio'),
            subtitles: streams.filter((s: any) => s.Type === 'Subtitle')
        };
    }
}


