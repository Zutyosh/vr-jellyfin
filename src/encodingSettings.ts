export const encodingSettings: Record<string, string> = {
    audioBitrate: process.env.AUDIO_BITRATE || "192000",
    videoBitrate: process.env.VIDEO_BITRATE || "3000000",
    maxAudioChannels: process.env.MAX_AUDIO_CHANNELS || "2",
    maxHeight: process.env.MAX_HEIGHT || "720",
    maxWidth: process.env.MAX_WIDTH || "1280",

    // be careful changing these
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    SubtitleMethod: "Encode",
    SubtitleCodec: "srt",
};
