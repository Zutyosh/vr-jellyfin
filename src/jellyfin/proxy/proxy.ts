import { randomBytes } from "crypto";

export default class Proxy {
    public readonly id: string = randomBytes(16).toString("hex");
    public readonly createdAt: Date = new Date();

    constructor(public itemId: string, public options?: ProxyOptions) { }
}

export interface ProxyOptions {
    audioBitrate?: number;
    videoBitrate?: number;
    height?: number;
    width?: number;
    audioChannels?: number;
    videoStreamIndex?: number;
    audioStreamIndex?: number;
    subtitleStreamIndex?: number;
    subtitleMethod?: SubtitleMethod;
}

export enum SubtitleMethod {
    Encode = "Encode",
    Embed = "Embed",
    External = "External",
    Hls = "Hls",
    Drop = "Drop",
}
