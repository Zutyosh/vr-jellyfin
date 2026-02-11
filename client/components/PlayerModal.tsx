// client/components/PlayerModal.tsx
import { useState, useEffect } from 'react';
import { Item, api, MediaStream } from '../lib/api';
import { X, Copy, Check, Info } from 'lucide-react';
import clsx from 'clsx';

interface Props {
    item: Item;
    onClose: () => void;
}

export function PlayerModal({ item, onClose }: Props) {
    const [audioStreams, setAudioStreams] = useState<MediaStream[]>([]);
    const [subtitleStreams, setSubtitleStreams] = useState<MediaStream[]>([]);

    // Selected indices (MediaStream.Index or null)
    const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
    const [selectedAudio, setSelectedAudio] = useState<number | null>(null);

    const [streamLink, setStreamLink] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadStreams();
    }, [item]);

    const loadStreams = async () => {
        try {
            const streams = await api.getMediaStreams(item.Id);

            // Sort streams by default/index for better UX
            const sortStreams = (a: MediaStream, b: MediaStream) => {
                if (a.IsDefault && !b.IsDefault) return -1;
                if (!a.IsDefault && b.IsDefault) return 1;
                return a.Index - b.Index;
            };

            setAudioStreams(streams.audio.sort(sortStreams));
            setSubtitleStreams(streams.subtitles.sort(sortStreams));

            // Auto-select default audio if present, otherwise first
            const defaultAudio = streams.audio.find(s => s.IsDefault) || streams.audio[0];
            if (defaultAudio) setSelectedAudio(defaultAudio.Index);

            // Auto-select forced subtitles if present? Or default?
            // Usually we prefer None unless forced or default is set.
            const defaultSub = streams.subtitles.find(s => s.IsDefault || s.IsForced);
            if (defaultSub) setSelectedSubtitle(defaultSub.Index);

        } catch (e) {
            console.error(e);
        }
    };

    const getTrackLabel = (track: MediaStream) => {
        let label = track.DisplayTitle || track.Title || track.Language || 'Unknown';

        // Enrich label if simple language code
        if (label.length === 3) label = label.toUpperCase();

        const flags = [];
        if (track.IsDefault) flags.push('Default');
        if (track.IsForced) flags.push('Forced');
        if (track.IsHearingImpaired) flags.push('SDH');

        if (flags.length > 0) {
            label += ` (${flags.join(', ')})`;
        }

        return label;
    };

    const generateLink = async () => {
        setLoading(true);
        try {
            const proxy = await api.createProxy(item.Id, selectedSubtitle, selectedAudio);
            setStreamLink(proxy.streamUrl);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (streamLink) {
            navigator.clipboard.writeText(streamLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <X />
                </button>

                <h2 className="text-xl font-bold mb-1 truncate pr-8">{item.Name}</h2>
                <p className="text-gray-400 text-sm mb-6 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Configure Playback
                </p>

                {/* Audio Streams */}
                {audioStreams.length > 0 && (
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Audio</label>
                        <div className="flex flex-wrap gap-2">
                            {audioStreams.map(audio => (
                                <button
                                    key={audio.Index}
                                    onClick={() => setSelectedAudio(audio.Index)}
                                    className={clsx(
                                        "px-3 py-2 rounded text-sm border transition-colors flex items-center gap-2 text-left",
                                        selectedAudio === audio.Index
                                            ? "bg-primary border-primary text-white"
                                            : "bg-transparent border-gray-600 text-gray-300 hover:border-gray-400"
                                    )}
                                >
                                    <span>{getTrackLabel(audio)}</span>
                                    {audio.Codec && <span className="text-xs opacity-60 uppercase border border-white/20 px-1 rounded">{audio.Codec}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Subtitles */}
                {subtitleStreams.length > 0 && (
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Subtitles</label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setSelectedSubtitle(null)}
                                className={clsx(
                                    "px-3 py-2 rounded text-sm border transition-colors",
                                    selectedSubtitle === null
                                        ? "bg-primary border-primary text-white"
                                        : "bg-transparent border-gray-600 text-gray-300 hover:border-gray-400"
                                )}
                            >
                                None
                            </button>
                            {subtitleStreams.map(sub => (
                                <button
                                    key={sub.Index}
                                    onClick={() => setSelectedSubtitle(sub.Index)}
                                    className={clsx(
                                        "px-3 py-2 rounded text-sm border transition-colors flex items-center gap-2 text-left",
                                        selectedSubtitle === sub.Index
                                            ? "bg-primary border-primary text-white"
                                            : "bg-transparent border-gray-600 text-gray-300 hover:border-gray-400"
                                    )}
                                >
                                    <span>{getTrackLabel(sub)}</span>
                                    {sub.Codec && <span className="text-xs opacity-60 uppercase border border-white/20 px-1 rounded">{sub.Codec}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Generate Button / Link */}
                {!streamLink ? (
                    <button
                        onClick={generateLink}
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center mt-4"
                    >
                        {loading ? <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></div> : "Generate Stream Link"}
                    </button>
                ) : (
                    <div className="mt-6 animate-in slide-in-from-bottom-2 bg-black/40 p-4 rounded-xl border border-white/10">
                        <label className="block text-xs font-uppercase text-gray-400 mb-2 font-semibold">Stream Link Ready</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={streamLink}
                                className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2.5 text-sm flex-1 text-gray-300 focus:outline-none focus:border-primary font-mono select-all"
                            />
                            <button
                                onClick={copyToClipboard}
                                className={clsx(
                                    "px-4 rounded-lg font-bold transition-colors flex items-center gap-2",
                                    copied ? "bg-green-600 text-white" : "bg-white text-black hover:bg-gray-200"
                                )}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">Paste this link into your VR player (VRChat, etc.)</p>
                    </div>
                )}
            </div>
        </div>
    );
}
