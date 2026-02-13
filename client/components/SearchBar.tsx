import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';

interface SearchBarProps {
    onSearch: (query: string) => void;
    placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = "Search..." }: SearchBarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcut to toggle/open search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.code === 'KeyT') {
                e.preventDefault();
                setIsOpen(true);
            }

            // Close on Escape if open
            if (e.code === 'Escape' && isOpen) {
                setIsOpen(false);
                inputRef.current?.blur();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSearch = () => {
        if (query.trim()) {
            onSearch(query.trim());
            // Optional: close on search? Or keep open? User request didn't specify.
            // Keeping it open allows refining search. 
            // But maybe blur?
            inputRef.current?.blur();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className={clsx(
            "flex items-center transition-all duration-300 ease-in-out bg-black/30 backdrop-blur-md rounded-full border overflow-hidden",
            isOpen
                ? "w-64 px-2 border-white/10"
                : "w-10 px-0 justify-center bg-transparent border-transparent hover:bg-white/10 pointer-events-none"
        )}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "p-2 text-white/70 hover:text-white transition-colors pointer-events-auto",
                    !isOpen && "w-10 h-10 flex items-center justify-center cursor-pointer"
                )}
            >
                <Search className="w-5 h-5" />
            </button>

            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={clsx(
                    "bg-transparent border-none outline-none text-white text-sm placeholder-white/40 transition-all duration-300",
                    isOpen ? "w-full px-2 opacity-100" : "w-0 px-0 opacity-0"
                )}
            />

            {isOpen && query && (
                <button
                    onClick={() => {
                        setQuery('');
                        inputRef.current?.focus();
                    }}
                    className="p-1 text-white/40 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            )}

            {isOpen && !query && (
                <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-white/40 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}
