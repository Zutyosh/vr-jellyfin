import JellyfinClient from "./client";

export const client = new JellyfinClient(
    process.env.JELLYFIN_HOST!,
    process.env.JELLYFIN_USERNAME!,
    process.env.JELLYFIN_PASSWORD!
);
