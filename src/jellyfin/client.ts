import { Api, Jellyfin } from "@jellyfin/sdk";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api/user-views-api";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import fetch from "node-fetch";
import { resolve } from "path";
import { ProxyOptions, SubtitleMethod } from "./proxy/proxy";
import * as http from "http";
import * as https from "https";
import { log } from "../utils/logger";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const encodingSettings: Record<string, string> = require(resolve("./encodingSettings.js")).encodingSettings;

export default class JellyfinClient {
    public static readonly APP_NAME = "Jellyfin VRChat Proxy (jellyfin-vrchat)";

    private _sdk: Jellyfin;
    private _api: Api;

    public userId?: string;

    constructor(
        public serverUrl: string,
        private username: string,
        private password: string
    ) {
        this.serverUrl = serverUrl.replace(/\/+$/, "");

        this._sdk = new Jellyfin({
            clientInfo: {
                name: JellyfinClient.APP_NAME,
                version: process.env.npm_package_version || "0.0.0",
            },
            deviceInfo: {
                name: `${JellyfinClient.APP_NAME} | ${process.platform} | ${process.arch}`,
                id: "jellyfin-vrchat",
            },
        });

        this._api = this._sdk.createApi(this.serverUrl);
    }

    public get apiKey() {
        return this._api.accessToken;
    }

    // Shared header set for all outgoing Jellyfin requests
    private get authHeaders() {
        return {
            "User-Agent": JellyfinClient.APP_NAME,
            "X-Emby-Token": this.apiKey,
        };
    }

    public async authenticate() {
        try {
            const auth = await this._api.authenticateUserByName(this.username, this.password);
            this.userId = auth.data.User?.Id;
            return auth.status === 200;
        } catch (e) {
            log.error("Failed to authenticate with Jellyfin", e);
            return false;
        }
    }

    // Generic wrapper for SDK calls (Axios) — catches 401/403, re-authenticates, retries
    private async sdkCall<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error: any) {
            if (error?.response?.status === 401 || error?.response?.status === 403) {
                log.warn("Jellyfin auth error (SDK), attempting re-authentication...");
                const success = await this.authenticate();
                if (success) {
                    log.info("Re-authentication successful, retrying operation...");
                    return await operation();
                } else {
                    log.error("Re-authentication failed.");
                }
            }
            throw error;
        }
    }

    // Generic wrapper for raw fetch calls — catches 401/403, re-authenticates, retries
    private async fetchCall(url: string | URL, options: any = {}): Promise<any> {
        let response = await fetch(url.toString(), {
            ...options,
            headers: { ...options.headers, ...this.authHeaders }
        });

        if (response.status === 401 || response.status === 403) {
            log.warn(`Jellyfin auth error (Fetch ${response.status}), attempting re-authentication...`);
            const success = await this.authenticate();

            if (success) {
                log.info("Re-authentication successful, retrying fetch...");
                response = await fetch(url.toString(), {
                    ...options,
                    headers: { ...options.headers, ...this.authHeaders }
                });
            } else {
                log.error("Re-authentication failed.");
            }
        }

        return response;
    }

    public async getUserViews() {
        return this.sdkCall(async () => {
            const response = await getUserViewsApi(this._api).getUserViews({
                userId: this.userId!,
            });
            return response.data.Items || [];
        });
    }

    public async getItems(params: any = {}) {
        return this.sdkCall(async () => {
            const userId = this.userId;
            if (!userId) throw new Error("User not authenticated");

            const query: any = {
                userId: userId,
                fields: ["AlbumArtist", "Artists", "ParentId"] as any,
                enableImageTypes: "Primary,Backdrop,Banner,Thumb",
                ...params
            };

            if (params.parentId) query.parentId = params.parentId;
            if (params.ParentId) query.parentId = params.ParentId;

            if (params.searchTerm || params.SearchTerm) {
                query.searchTerm = params.searchTerm || params.SearchTerm;
                query.recursive = true;
                query.includeItemTypes = "Movie,Series,Episode,Audio";
            } else {
                if (params.Recursive !== undefined) {
                    query.recursive = params.Recursive === 'true' || params.Recursive === true;
                }
            }

            const itemsResponse = await getItemsApi(this._api).getItems(query);
            let items = itemsResponse.data.Items || [];

            if (query.searchTerm) {
                items = this.smartFilter(items, query.searchTerm);
            }

            return items.filter((item: any) => {
                if (item.LocationType === 'Virtual') return false;
                if (item.IsMissing === true) return false;
                return true;
            });
        });
    }

    private smartFilter(items: any[], term: string): any[] {
        if (!term) return items;
        const lowerTerm = term.toLowerCase();

        if (/[^\x00-\x7F]/.test(term)) {
            return items.filter(item => item.Name?.toLowerCase().includes(lowerTerm));
        }

        const escapedTerm = this.escapeRegExp(term);
        const regex = new RegExp(`(?:^|[^a-z0-9])${escapedTerm}(?:$|[^a-z0-9])`, 'i');

        return items.filter(item => {
            return regex.test(item.Name || '');
        });
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    public async getItem(itemId: string) {
        return this.sdkCall(async () => {
            const itemsResponse = await getItemsApi(this._api).getItems({
                userId: this.userId!,
                ids: [itemId],
                fields: ["AlbumArtist", "Artists", "MediaSources"] as any,
            });
            return itemsResponse.data.Items?.[0];
        });
    }

    public async getImage(itemId: string, imageType: string = "Primary", index?: number) {
        let url = `${this.serverUrl}/Items/${itemId}/Images/${imageType}`;
        if (index !== undefined) url += `/${index}`;

        return this.fetchCall(url);
    }

    public async getStream(itemId: string, proxyId: string, options?: ProxyOptions) {
        const item = await this.getItem(itemId);
        const isAudio = item?.Type === 'Audio';
        const mediaSourceId = item?.MediaSources?.[0]?.Id;

        let url: URL;

        if (isAudio) {
            url = new URL(`${this.serverUrl}/Audio/${itemId}/stream`);
            if (mediaSourceId) url.searchParams.set("MediaSourceId", mediaSourceId);

            url.searchParams.set("static", "true");
            url.searchParams.set("container", "mp3");
            url.searchParams.set("audioCodec", "mp3");
        } else {
            url = new URL(`${this.serverUrl}/Videos/${itemId}/stream`);
            if (mediaSourceId) url.searchParams.set("MediaSourceId", mediaSourceId);

            url.searchParams.set("container", "mp4");
            url.searchParams.set("audioCodec", "aac");
            url.searchParams.set("videoCodec", "h264");

            for (const [k, v] of Object.entries(encodingSettings)) {
                url.searchParams.set(k, v);
            }

            if (options?.audioStreamIndex !== undefined) {
                url.searchParams.set("AudioStreamIndex", options.audioStreamIndex.toString());
            }

            if (options?.subtitleStreamIndex !== undefined) {
                url.searchParams.set("SubtitleMethod", options.subtitleMethod || SubtitleMethod.Encode);
                url.searchParams.set("SubtitleStreamIndex", options.subtitleStreamIndex.toString());
            }
        }

        // Force unique session per proxy instance
        url.searchParams.set("PlaySessionId", proxyId);
        url.searchParams.set("DeviceId", `jellyfin-vrchat-${proxyId}`);

        // FIX: Explicitly remove SubtitleCodec to allow FFmpeg to handle image-based subtitles (PGS/VOBSUB)
        url.searchParams.delete("SubtitleCodec");

        log.info(`Requesting stream: ${url.pathname}${url.search.replace(/api_key=[a-zA-Z0-9]+/, "api_key=REDACTED")}`);

        return this.fetchCall(url.toString(), {
            agent: (parsedUrl: any) => {
                if (parsedUrl.protocol === 'http:') {
                    return httpAgent;
                } else {
                    return httpsAgent;
                }
            },
            timeout: 0,
        });
    }

    // Fetch available media streams (Audio & Subtitles)
    public async getMediaStreams(itemId: string) {
        const url = `${this.serverUrl}/Items/${itemId}?Fields=MediaStreams`;
        const response = await this.fetchCall(url);
        const data = await response.json();
        const streams = data.MediaStreams || [];
        return {
            audio: streams.filter((s: any) => s.Type === 'Audio'),
            subtitles: streams.filter((s: any) => s.Type === 'Subtitle')
        };
    }
}
