// client/lib/api.ts

export interface Item {
    Id: string;
    Name: string;
    Type: string;
    MediaType?: string;
    DateCreated?: string;
    ImageTags?: {
        Primary?: string;
    };
    BackdropImageTags?: string[];
    indexNumber?: number;
    ParentIndexNumber?: number; // Season number
    IndexNumber?: number; // Episode number
    Overview?: string;
    RunTimeTicks?: number;
    CommunityRating?: number;
    ProductionYear?: number;
    AlbumArtist?: string;
    Artists?: string[];
}

export interface MediaStream {
    Index: number;
    DisplayTitle?: string;
    Title?: string;
    Language?: string;
    Codec?: string;
    IsDefault?: boolean;
    IsForced?: boolean;
    IsHearingImpaired?: boolean; // SDH
    Type: 'Audio' | 'Subtitle';
}

export const api = {
    getViews: async (): Promise<Item[]> => {
        const res = await fetch('/api/views');
        if (!res.ok) throw new Error('Failed to fetch views');
        return res.json();
    },

    getItems: async (parentId: string): Promise<Item[]> => {
        const res = await fetch(`/api/items?parentId=${parentId}`);
        if (!res.ok) throw new Error('Failed to fetch items');
        return res.json();
    },

    searchItems: async (query: string, parentId?: string): Promise<Item[]> => {
        const params = new URLSearchParams({
            searchTerm: query,
            Recursive: 'true',
            IncludeItemTypes: 'Movie,Series,Episode,Audio'
        });
        if (parentId) {
            params.append('ParentId', parentId);
        }
        const res = await fetch(`/api/items?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to search items');
        return res.json();
    },

    getItem: async (itemId: string): Promise<Item> => {
        const res = await fetch(`/api/item/${itemId}`);
        if (!res.ok) throw new Error('Failed to fetch item');
        return res.json();
    },

    getImageUrl: (itemId: string) => {
        return `/api/image/${itemId}`;
    },

    getMediaStreams: async (itemId: string): Promise<{ audio: MediaStream[], subtitles: MediaStream[] }> => {
        const res = await fetch(`/api/streams/${itemId}`);
        if (!res.ok) throw new Error('Failed to fetch streams');
        return res.json();
    },

    createProxy: async (itemId: string, subtitleStreamIndex?: number | null, audioStreamIndex?: number | null) => {
        const res = await fetch(`/api/proxy/${itemId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtitleStreamIndex, audioStreamIndex }),
        });
        if (!res.ok) throw new Error('Failed to create proxy');
        return res.json();
    },

    getPlaylistUrl: (itemId: string) => {
        return `${window.location.origin}/playlist/${itemId}.m3u8`;
    }
};
