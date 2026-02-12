// client/components/DetailView.tsx
import { Item, api } from '../lib/api';
import { Play, Calendar, Clock, Star, ListMusic } from 'lucide-react';
import { useState } from 'react';
import { Toast, ToastType } from './Toast';

interface Props {
    item: Item;
    items: Item[]; // Children (seasons/episodes)
    onNavigate: (item: Item) => void;
    onPlay: (item: Item) => void;
}

export function DetailView({ item, items, onNavigate, onPlay }: Props) {
    // If the main item is playable (Movie), use it. Otherwise wait for user to pick an episode.
    const isMainPlayable = item.Type === 'Movie' || item.Type === 'Video' || item.Type === 'Episode';
    const [toast, setToast] = useState<{ show: boolean; message: string; type: ToastType }>({ show: false, message: '', type: 'success' });

    const handlePlayClick = (targetItem: Item) => {
        onPlay(targetItem);
    };

    const handlePlayAll = async () => {
        try {
            const url = api.getPlaylistUrl(item.Id);
            await navigator.clipboard.writeText(url);
            setToast({ show: true, message: 'Playlist Link Copied!', type: 'success' });
        } catch (err) {
            console.error('Failed to copy playlist link:', err);
            setToast({ show: true, message: 'Failed to copy link', type: 'error' });
        }
    };

    // Helper to format ticks to runtime
    const formatRuntime = (ticks?: number) => {
        if (!ticks) return '';
        const minutes = Math.round(ticks / 10000 / 1000 / 60);
        return `${minutes} min`;
    };

    // Specialized View for Music Albums
    if (item.Type === 'MusicAlbum') {
        return (
            <div className="animate-fade-in p-8">
                {/* Album Header */}
                <div className="flex flex-col md:flex-row gap-8 mb-12">
                    {/* Album Art (Left) */}
                    <div className="flex-shrink-0 w-64 h-64 md:w-80 md:h-80 shadow-2xl rounded-lg overflow-hidden relative group">
                        <img
                            src={api.getImageUrl(item.Id)}
                            className="w-full h-full object-cover"
                            alt={item.Name}
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                    </div>

                    {/* Album Info (Right) */}
                    <div className="flex flex-col justify-end">
                        <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-2">Album</h2>
                        <h1 className="text-4xl md:text-6xl font-bold mb-4 text-white">{item.Name}</h1>
                        <div className="flex items-center gap-4 text-gray-300 text-lg mb-6">
                            {item.AlbumArtist && <span className="font-semibold text-white">{item.AlbumArtist}</span>}
                            {item.ProductionYear && <span>{item.ProductionYear}</span>}
                            <span>{items.length} tracks</span>
                            {/* Calculate total duration if possible, or just show track count */}
                        </div>

                        <div>
                            <button
                                onClick={handlePlayAll}
                                className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full font-medium flex items-center gap-2 transition-colors border border-white/10"
                            >
                                <ListMusic className="w-5 h-5" />
                                Play All
                            </button>
                        </div>
                    </div>
                </div>

                {/* Track List */}
                <div className="space-y-1">
                    {/* Table Header */}
                    <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm text-gray-400 border-b border-gray-800 uppercase tracking-wider">
                        <div className="w-8 text-center">#</div>
                        <div>Title</div>
                        <div className="flex items-center gap-1"><Clock className="w-4 h-4" /></div>
                    </div>

                    {/* Tracks */}
                    {items.map((track, idx) => (
                        <div
                            key={track.Id}
                            onClick={() => handlePlayClick(track)}
                            className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 rounded-md hover:bg-white/10 group cursor-pointer items-center transition-colors"
                        >
                            <div className="w-8 text-center text-gray-400 font-medium group-hover:text-white">
                                <span className="group-hover:hidden">{track.IndexNumber || idx + 1}</span>
                                <Play className="w-4 h-4 hidden group-hover:inline-block fill-white" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-white font-medium text-base">{track.Name}</span>
                                <span className="text-sm text-gray-400 group-hover:text-gray-300">
                                    {track.Artists?.join(', ') || item.AlbumArtist}
                                </span>
                            </div>
                            <div className="text-sm text-gray-400 font-mono">
                                {formatRuntime(track.RunTimeTicks)}
                            </div>
                        </div>
                    ))}
                </div>

                <Toast
                    show={toast.show}
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(prev => ({ ...prev, show: false }))}
                />
            </div>
        );
    }

    // Default View (Movies / Series)
    return (
        <div className="animate-fade-in">
            {/* Hero Section */}
            <div className="relative h-[50vh] w-full rounded-xl overflow-hidden mb-8 shadow-2xl">
                <div className="absolute inset-0">
                    {item.BackdropImageTags && item.BackdropImageTags.length > 0 && (
                        <img
                            src={`${api.getImageUrl(item.Id)}/Backdrop/0`}
                            className="w-full h-full object-cover"
                            alt="Background"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                </div>

                <div className="absolute bottom-0 left-0 p-8 w-full max-w-4xl">
                    <h1 className="text-4xl md:text-6xl font-bold mb-4 text-shadow">{item.Name}</h1>

                    <div className="flex items-center gap-4 text-sm md:text-base text-gray-300 mb-6">
                        {item.ProductionYear && (
                            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {item.ProductionYear}</span>
                        )}
                        {item.RunTimeTicks && (
                            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {formatRuntime(item.RunTimeTicks)}</span>
                        )}
                        {item.CommunityRating && (
                            <span className="flex items-center gap-1 text-yellow-500"><Star className="w-4 h-4 fill-yellow-500" /> {item.CommunityRating.toFixed(1)}</span>
                        )}
                    </div>

                    <p className="text-gray-200 text-lg line-clamp-3 mb-8 max-w-2xl text-shadow-sm">
                        {item.Overview}
                    </p>

                    <div className="flex gap-4">
                        {isMainPlayable && (
                            <button
                                onClick={() => handlePlayClick(item)}
                                className="bg-primary hover:bg-primary/80 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-transform active:scale-95"
                            >
                                <Play className="fill-white" /> Play
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Sub Items (Episodes / Seasons) */}
            {items.length > 0 && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold border-b border-gray-800 pb-2">
                        {item.Type === 'Series' ? 'Seasons' : 'Episodes'}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {items.map(sub => (
                            <div
                                key={sub.Id}
                                className="flex gap-4 bg-surface p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                                onClick={() => {
                                    if (sub.Type === 'Season') onNavigate(sub);
                                    else handlePlayClick(sub); // Play episode
                                }}
                            >
                                <div className="w-32 aspect-video bg-gray-800 rounded overflow-hidden flex-shrink-0 relative">
                                    {sub.ImageTags?.Primary ? (
                                        <img src={api.getImageUrl(sub.Id)} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        // Fallback icon for Audio/Missing images
                                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                                            <Play className="w-8 h-8 text-gray-600" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Play className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h4 className="font-medium truncate">{sub.Name}</h4>
                                    {sub.IndexNumber !== undefined && (
                                        <div className="text-sm text-gray-400">Episode {sub.IndexNumber}</div>
                                    )}
                                    {sub.CommunityRating && (
                                        <div className="text-xs text-yellow-500 flex items-center gap-1 mt-1">
                                            <Star className="w-3 h-3 fill-yellow-500" /> {sub.CommunityRating.toFixed(1)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <Toast
                show={toast.show}
                message={toast.message}
                type={toast.type}
                onClose={() => setToast(prev => ({ ...prev, show: false }))}
            />
        </div>
    );
}
