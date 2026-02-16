import { Api, Jellyfin } from "@jellyfin/sdk";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api/user-views-api";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import fetch from "node-fetch";
<<<<<<< Updated upstream
import { resolve } from "path";
import { ProxyOptions, SubtitleMethod } from "./proxy/proxy"; // Added import
=======
import { ProxyOptions, SubtitleMethod } from "./proxy/proxy";
import { encodingSettings } from "../encodingSettings";
import { log } from "../utils/logger";
import * as http from "http";
import * as https from "https";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
>>>>>>> Stashed changes

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

    // shared header set for all outgoing Jellyfin requests bahhhhhhhh
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

    // Generic wrapper for SDK calls (Axios) i guess
    private async sdkCall<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error: any) {
            // Check for auth errors (401 Unauthorized / 403 Forbidden)
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

    // Generic wrapper for raw fetch calls (Stream/Image/MediaStreams) kekw
    private async fetchCall(url: string | URL, options: any = {}): Promise<any> {
        // First attempt
        let response = await fetch(url.toString(), {
            ...options,
            headers: { ...options.headers, ...this.authHeaders }
        });

        if (response.status === 401 || response.status === 403) {
            log.warn(`Jellyfin auth error (Fetch ${response.status}), attempting re-authentication...`);
            const success = await this.authenticate();

            if (success) {
                log.info("Re-authentication successful, retrying fetch...");
                // Retry with new headers (apiKey is a getter, so it pulls the new token)
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

<<<<<<< Updated upstream
    public async getPlayableMedia() {
        const viewsResponse = await getUserViewsApi(this._api).getUserViews({
            userId: this.userId!,
        });

        const views = viewsResponse.data.Items || [];
        const items = await Promise.all(
            views.map(async (view) => {
                const itemsResponse = await this.getSubItemsRecursive(view.Id!);

                return {
                    itemId: view.Id,
                    name: view.Name,
                    subItems: itemsResponse,
                };
            })
        ).catch((e) => {
            console.error("Failed to get playable media", e);
=======
    public async getUserViews() {
        return this.sdkCall(async () => {
            const response = await getUserViewsApi(this._api).getUserViews({
                userId: this.userId!,
            });
            return response.data.Items || [];
        });
    }

    public async getItems(params: Record<string, any> = {}) {
        return this.sdkCall(async () => {
            const userId = this.userId;
            if (!userId) throw new Error("User not authenticated");

            const query: Record<string, any> = {
                userId,
                fields: ["AlbumArtist", "Artists", "ParentId"] as any,
                enableImageTypes: "Primary,Backdrop,Banner,Thumb",
                ...params,
            };

            if (params.parentId) query.parentId = params.parentId;
            if (params.ParentId) query.parentId = params.ParentId;

            if (params.searchTerm || params.SearchTerm) {
                query.searchTerm = params.searchTerm || params.SearchTerm;
                query.recursive = true;
                query.includeItemTypes = params.includeItemTypes || params.IncludeItemTypes || "Movie,Series,Episode,Audio,MusicArtist,MusicAlbum,BoxSet";
            } else {
                if (params.Recursive !== undefined) {
                    query.recursive =
                        params.Recursive === "true" || params.Recursive === true;
                }
            }

            const response = await getItemsApi(this._api).getItems(query);
            let items = response.data.Items || [];

            if (query.searchTerm) {
                items = this.smartFilter(items, query.searchTerm);
            }

            return items.filter((item: any) => {
                if (item.LocationType === "Virtual") return false;
                if (item.IsMissing === true) return false;
                return true;
            });
>>>>>>> Stashed changes
        });
        return items;
    }

<<<<<<< Updated upstream
    public async getSubItems(parent: string) {
        const itemsResponse = await getItemsApi(this._api).getItems({
            userId: this.userId!,
            parentId: parent,
        });

        return itemsResponse.data.Items;
    }

    public async getSubItemsRecursive(parent: string): Promise<NestedItem[]> {
        const items = await this.getSubItems(parent);

        if (!items || items.length == 0) {
            return [];
        }

        const subItems = await Promise.all(
            items.map(async (item) => {
                if (!item.IsFolder) {
                    return {
                        itemId: item.Id!,
                        name: item.Name || undefined,
                        playable: item.MediaType == "Video",
                        episode: item.IndexNumber || undefined,
                    };
                }

                return {
                    itemId: item.Id!,
                    name: item.Name || undefined,
                    subItems: await this.getSubItemsRecursive(item.Id!),
                };
            })
        );

        return subItems;
    }

    public async getVideoStream(itemId: string, options?: ProxyOptions) {
        const url = new URL(`${this.serverUrl}/Videos/${itemId}/stream`);
        url.searchParams.set("api_key", this.apiKey);
=======
    private smartFilter(items: any[], term: string): any[] {
        if (!term) return items;
        const lower = term.toLowerCase();

        if (/[^\x00-\x7F]/.test(term)) {
            return items.filter((i) => i.Name?.toLowerCase().includes(lower));
        }

        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i");
        return items.filter((i) => re.test(i.Name || ""));
    }

    public async getItem(itemId: string) {
        return this.sdkCall(async () => {
            const response = await getItemsApi(this._api).getItems({
                userId: this.userId!,
                ids: [itemId],
                fields: ["AlbumArtist", "Artists", "MediaSources"] as any,
            });
            return response.data.Items?.[0];
        });
    }

    public async getImage(
        itemId: string,
        imageType: string = "Primary",
        index?: number
    ) {
        let url = `${this.serverUrl}/Items/${itemId}/Images/${imageType}`;
        if (index !== undefined) url += `/${index}`;

        return this.fetchCall(url);
    }

    public async getStream(
        itemId: string,
        proxyId: string,
        options?: ProxyOptions
    ) {
        // Need to fetch item details first to determine media type
        // Use internal helper which is already wrapped with sdkCall
        const item = await this.getItem(itemId);
        const isAudio = item?.Type === "Audio";
        const mediaSourceId = item?.MediaSources?.[0]?.Id;
>>>>>>> Stashed changes

        // Default encoding settings
        url.searchParams.set("container", "mp4");
        url.searchParams.set("audioCodec", "aac");
        url.searchParams.set("videoCodec", "h264");

<<<<<<< Updated upstream
        // Override encoding settings if provided
        for (const [k, v] of Object.entries(encodingSettings)) {
            url.searchParams.set(k, v);
        }

        // Include subtitle parameters if provided
        if (options?.subtitleStreamIndex !== undefined) {
            url.searchParams.set("SubtitleMethod", options.subtitleMethod || SubtitleMethod.Encode);
            url.searchParams.set("SubtitleCodec", "srt"); // Adjust the codec if necessary
            url.searchParams.set("SubtitleStreamIndex", options.subtitleStreamIndex.toString());
        }

        console.log(`Requesting video stream from ${url.toString()}`);

        const response = await fetch(url.toString(), {
            headers: {
                "User-Agent": JellyfinClient.APP_NAME,
            },
=======
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
                url.searchParams.set(
                    "AudioStreamIndex",
                    options.audioStreamIndex.toString()
                );
            }

            if (options?.subtitleStreamIndex !== undefined) {
                url.searchParams.set(
                    "SubtitleMethod",
                    options.subtitleMethod || SubtitleMethod.Encode
                );
                url.searchParams.set(
                    "SubtitleStreamIndex",
                    options.subtitleStreamIndex.toString()
                );
            }
        }

        url.searchParams.set("PlaySessionId", proxyId);
        url.searchParams.set("DeviceId", `jellyfin-vrchat-${proxyId}`);

        url.searchParams.delete("SubtitleCodec");

        log.info(`Requesting stream: ${url.pathname}${url.search}`);

        // Pass headers specifically for this request
        // The fetchCall wrapper will merge them with authHeaders
        return this.fetchCall(url.toString(), {
            agent: (parsed: any) =>
                parsed.protocol === "http:" ? httpAgent : httpsAgent,
            timeout: 0,
>>>>>>> Stashed changes
        });
    }

<<<<<<< Updated upstream
    // New method to fetch available subtitle streams
    public async getSubtitleStreams(itemId: string) {
        const url = `${this.serverUrl}/Items/${itemId}?Fields=MediaStreams&api_key=${this.apiKey}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": JellyfinClient.APP_NAME,
            },
        });
        const data = await response.json();
        const subtitleStreams = data.MediaStreams.filter((stream: any) => stream.Type === "Subtitle");
        return subtitleStreams;
    }

    public getRandomItem(items: NestedItem[]): NestedItem | undefined {
        if (items.length == 0) {
            return undefined;
        }

        const item = items[Math.floor(Math.random() * items.length)];
        if (item.subItems && item.subItems.length > 0) {
            return this.getRandomItem(item.subItems);
        }

        return item;
    }
}

interface NestedItem {
    itemId: string;
    name?: string;
    subItems?: NestedItem[];
    playable?: boolean;
    episode?: number;
}
=======
    public async getMediaStreams(itemId: string) {
        const url = `${this.serverUrl}/Items/${itemId}?Fields=MediaStreams`;
        const response = await this.fetchCall(url);
        const data = await response.json();
        const streams = data.MediaStreams || [];
        return {
            audio: streams.filter((s: any) => s.Type === "Audio"),
            subtitles: streams.filter((s: any) => s.Type === "Subtitle"),
        };
    }
}
>>>>>>> Stashed changes
