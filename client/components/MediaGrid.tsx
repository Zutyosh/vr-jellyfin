// client/components/MediaGrid.tsx
import { Item, api } from '../lib/api';
import { Play } from 'lucide-react';

interface Props {
    items: Item[];
    onNavigate: (item: Item) => void;
}

export function MediaGrid({ items, onNavigate }: Props) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item) => {
                const isLandscape = item.Type === 'CollectionFolder' || item.Type === 'UserView';
                return (
                    <div
                        key={item.Id}
                        className="group relative bg-surface rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105 hover:z-10 shadow-lg border border-transparent hover:border-white/20"
                        onClick={() => onNavigate(item)}
                    >
                        <div className={`${isLandscape ? 'aspect-video' : 'aspect-[2/3]'} w-full relative`}>
                            {item.ImageTags?.Primary ? (
                                <img
                                    src={api.getImageUrl(item.Id)}
                                    alt={item.Name}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500">
                                    No Image
                                </div>
                            )}

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play className="w-12 h-12 text-white fill-white" />
                            </div>
                        </div>

                        <div className="p-3">
                            <h3 className="font-semibold truncate text-sm sm:text-base" title={item.Name}>
                                {item.Name}
                            </h3>
                            <div className="flex justify-between items-center mt-1 text-xs text-gray-400">
                                <span>{item.Type}</span>
                                {item.CommunityRating && (
                                    <span className="bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">
                                        {item.CommunityRating.toFixed(1)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
