// client/App.tsx
import { useState, useEffect } from 'react';
import { api, Item } from './lib/api';
import { MediaGrid } from './components/MediaGrid';
import { DetailView } from './components/DetailView';
import { PlayerModal } from './components/PlayerModal';
import { SearchBar } from './components/SearchBar';
import { Toast, ToastType } from './components/Toast';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

function App() {
    const [navStack, setNavStack] = useState<Item[]>([]);
    const [currentView, setCurrentView] = useState<'grid' | 'detail'>('grid');
    const [currentItem, setCurrentItem] = useState<Item | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItemForPlay, setSelectedItemForPlay] = useState<Item | null>(null);
    const [toast, setToast] = useState<{ show: boolean; message: string; type: ToastType }>({ show: false, message: '', type: 'success' });

    // Simple in-memory cache for folder contents
    const [itemCache, setItemCache] = useState<Record<string, Item[]>>({});

    const showToast = (message: string, type: ToastType = 'success') => {
        setToast({ show: true, message, type });
    };

    // Initial load (User Views)
    useEffect(() => {
        loadHome();
    }, []);

    const loadHome = async () => {
        // Check cache for home/root views (using a specific key like 'root')
        if (itemCache['root']) {
            setItems(itemCache['root']);
            setNavStack([]);
            setCurrentView('grid');
            setCurrentItem(null);
            return;
        }

        setLoading(true);
        try {
            const views = await api.getViews();
            setItems(views);
            setItemCache((prev: Record<string, Item[]>) => ({ ...prev, 'root': views }));
            setNavStack([]);
            setCurrentView('grid');
            setCurrentItem(null);
        } catch (e) {
            console.error(e);
            showToast('Failed to load views', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDirectCopy = async (item: Item) => {
        setLoading(true);
        try {
            const proxy = await api.createProxy(item.Id);

            let url = proxy.streamUrl;
            // Force HTTPS if not localhost
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (!isLocal && url.startsWith('http:')) {
                url = url.replace(/^http:/, 'https:');
            }

            await navigator.clipboard.writeText(url);
            showToast(`Link copied: ${item.Name}`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Failed to generate link', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = async (item: Item) => {
        // If it's a folder or library, specific types usually indicate browsing
        const isFolder = item.Type === 'CollectionFolder' || item.Type === 'UserView' || item.Type === 'Series' || item.Type === 'Season' || item.Type === 'BoxSet' || item.Type === 'MusicAlbum';

        if (isFolder) {
            // Check cache first
            if (itemCache[item.Id]) {
                const cachedChildren = itemCache[item.Id];

                // UX: Single Track Album optimization (check from cache)
                if (cachedChildren.length === 1 && cachedChildren[0].Type === 'Audio') {
                    handleDirectCopy(cachedChildren[0]);
                    return;
                }

                setNavStack(prev => [...prev, item]);

                // Auto-skip "Season 1" logic (from cache)
                if (cachedChildren.length === 1 && cachedChildren[0].Type === 'Season') {
                    const season = cachedChildren[0];
                    // recurse cache check for season? 
                    // for simplicity, let's just trigger another navigate or let the standard flow handle it.
                    // Actually, the original logic fetched recursively. 
                    // Let's keep it simple: if cached, show it. If we need to dig deeper, we will click or handle it.
                    // But to match original behavior of skipping:
                    if (itemCache[season.Id]) {
                        setItems(itemCache[season.Id]);
                    } else {
                        // Need to fetch season content if not in cache
                        setLoading(true);
                        try {
                            const episodes = await api.getItems(season.Id);
                            setItemCache(prev => ({ ...prev, [season.Id]: episodes }));
                            setItems(episodes);
                        } catch (e) { console.error(e); }
                        finally { setLoading(false); }
                    }
                } else {
                    setItems(cachedChildren);
                }

                if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'MusicAlbum') {
                    setCurrentView('detail');
                    setCurrentItem(item);
                } else {
                    setCurrentView('grid');
                    setCurrentItem(null);
                }
                return;
            }

            setLoading(true);

            try {
                // Fetch children first to check for single-track optimization
                const children = await api.getItems(item.Id);

                // Update Cache
                setItemCache(prev => ({ ...prev, [item.Id]: children }));

                // UX: Single Track Album optimization
                // If opening an album (or season?) that has exactly 1 Audio track, just play/copy it.
                if (children.length === 1 && children[0].Type === 'Audio') {
                    // Don't navigate, just copy
                    await handleDirectCopy(children[0]);
                    setLoading(false);
                    return;
                }

                // Push to stack only if we are moving deeper
                setNavStack(prev => [...prev, item]);

                // Auto-skip "Season 1" if it's the only season
                if (children.length === 1 && children[0].Type === 'Season') {
                    const season = children[0];
                    // Check cache for season
                    if (itemCache[season.Id]) {
                        setItems(itemCache[season.Id]);
                    } else {
                        const episodes = await api.getItems(season.Id);
                        setItemCache(prev => ({ ...prev, [season.Id]: episodes }));
                        setItems(episodes);
                    }
                } else {
                    setItems(children);
                }

                // Switch to detail view if it's a Movie or Episode, but generally navigate folders in grid
                // MusicAlbum should also be DetailView to show tracks
                if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'MusicAlbum') {
                    setCurrentView('detail');
                    setCurrentItem(item);
                } else {
                    setCurrentView('grid');
                    setCurrentItem(null);
                }

            } catch (e) {
                console.error(e);
                showToast('Failed to load items', 'error');
            } finally {
                setLoading(false);
            }
        } else if (item.Type === 'Movie' || item.Type === 'Episode' || item.Type === 'Video' || item.Type === 'Audio') {
            // Check if it's audio for direct copy
            if (item.Type === 'Audio') {
                handleDirectCopy(item);
            } else {
                // Video items open modal
                setSelectedItemForPlay(item);
            }
        }
    };

    const handleBack = async () => {
        if (navStack.length === 0) return;

        const newStack = [...navStack];
        newStack.pop(); // Remove current level
        setNavStack(newStack);

        // If going back to home
        if (newStack.length === 0) {
            // Check cache for root
            if (itemCache['root']) {
                setItems(itemCache['root']);
                setCurrentView('grid');
                setCurrentItem(null);
            } else {
                loadHome();
            }
            return;
        }

        const parent = newStack[newStack.length - 1];

        // Check cache for parent
        if (itemCache[parent.Id]) {
            setItems(itemCache[parent.Id]);
            // Restore view state based on parent type
            if (parent.Type === 'Series' || parent.Type === 'Season') {
                setCurrentItem(parent);
                setCurrentView('detail');
            } else {
                setCurrentItem(null);
                setCurrentView('grid');
            }
            return;
        }

        setLoading(true);
        try {
            const children = await api.getItems(parent.Id);
            setItems(children);
            setItemCache(prev => ({ ...prev, [parent.Id]: children }));

            // Restore view state based on parent type
            if (parent.Type === 'Series' || parent.Type === 'Season') {
                setCurrentItem(parent);
                setCurrentView('detail');
            } else {
                setCurrentItem(null);
                setCurrentView('grid');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    const handleSearch = async (query: string) => {
        setLoading(true);
        try {
            // Contextual Search: If inside a library, use its ID as parentId
            const contextId = navStack.length > 0 ? navStack[0].Id : undefined;
            const results = await api.searchItems(query, contextId);
            setItems(results);

            // Create a virtual item for search results to put in navStack
            const searchItem: Item = {
                Id: 'search-results',
                Name: `Recherche: ${query}`,
                Type: 'Search', // Virtual type
            };

            setNavStack(prev => [...prev, searchItem]);
            setCurrentView('grid');
            setCurrentItem(null);

            // Optional: cache results? unique ID per search?
            // For now, no caching for search results to keep it simple and fresh.
        } catch (e) {
            console.error(e);
            showToast('Search failed', 'error');
        } finally {
            setLoading(false);
        }
    };
    // Breadcrumbs or simplified header


    return (
        <div className="min-h-screen bg-background font-sans">
            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-md border-b border-white/5 h-16 flex items-center px-6 pointer-events-none">
                <div className="flex items-center gap-4 w-full pointer-events-auto">
                    <div className="flex items-center gap-4 flex-1">
                        {navStack.length > 0 && (
                            <button
                                onClick={handleBack}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                        )}
                        <button onClick={loadHome} className={clsx("p-1.5 hover:bg-white/10 rounded-full transition-colors", navStack.length === 0 && "opacity-100", navStack.length > 0 && "opacity-70 hover:opacity-100")}>
                            <img src="/icon_no_bg.png" className="w-8 h-8 object-contain" alt="Home" />
                        </button>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                            Jellyfin VR
                        </h1>
                        {navStack.length > 0 && (
                            <span className="text-gray-400 text-sm border-l border-gray-700 pl-4 ml-2">
                                {navStack.map(i => i.Name).join(' / ')}
                            </span>
                        )}
                    </div>

                    {/* Search Bar - Always visible */}
                    <div className="ml-auto pointer-events-auto">
                        <SearchBar
                            onSearch={handleSearch}
                            placeholder={navStack.length > 0 ? `Search in ${navStack[0].Name}...` : "Search everywhere..."}
                        />
                    </div>
                </div>
            </nav>

            <main className="pt-20 px-6 pb-10">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <>
                        {currentView === 'grid' && (
                            <MediaGrid items={items} onNavigate={handleNavigate} />
                        )}
                        {currentView === 'detail' && currentItem && (
                            <DetailView
                                item={currentItem}
                                items={items} // Children (episodes/seasons)
                                onNavigate={handleNavigate}
                                onPlay={(item) => {
                                    if (item.Type === 'Audio') {
                                        handleDirectCopy(item);
                                    } else {
                                        setSelectedItemForPlay(item);
                                    }
                                }}
                            />
                        )}
                    </>
                )}
            </main>

            {/* Global Player Modal */}
            {selectedItemForPlay && (
                <PlayerModal
                    item={selectedItemForPlay}
                    onClose={() => setSelectedItemForPlay(null)}
                />
            )}

            {/* Notification Toast */}
            <Toast
                show={toast.show}
                message={toast.message}
                type={toast.type}
                onClose={() => setToast(prev => ({ ...prev, show: false }))}
            />
        </div>
    );
}

export default App;
