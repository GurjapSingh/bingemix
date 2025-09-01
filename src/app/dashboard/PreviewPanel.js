'use client';

import { useState } from 'react';

export default function PreviewPanel({ selected }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState([]);
    const [playlistName, setPlaylistName] = useState('');

    function buildRoundRobinPlaylist(showsAndEpisodes) {
        const pointers = new Map(showsAndEpisodes.map((s) => [s.ratingKey, 0]));
        const mixedEpisodes = [];

        let keepGoing = true;

        while (keepGoing) {
            keepGoing = false;
            for (const show of showsAndEpisodes) {
                const showPointer = pointers.get(show.ratingKey);
                if (showPointer < show.episodes.length) {
                    const ep = show.episodes[showPointer];
                    mixedEpisodes.push({ ...ep, showTitle: show.title });
                    pointers.set(show.ratingKey, showPointer + 1);
                    keepGoing = true;
                }
            }
        }
        setPreview(mixedEpisodes);
    }

    async function handlePreview() {
        setLoading(true);
        setError('');
        setPreview([]);

        try {
            const results = await Promise.all(
                selected.map(async (show) => {
                    const res = await fetch(
                        `/api/shows/${show.ratingKey}/episodes`,
                        {
                            cache: 'no-store',
                        }
                    );
                    if (!res.ok)
                        throw new Error(
                            `Error fetching episodes for ${show.title}`
                        );
                    const data = await res.json();
                    return { ...show, episodes: data.episodes ?? [] };
                })
            );

            buildRoundRobinPlaylist(results);
        } catch (error) {
            setError(error.message || 'Error fetching episodes');
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
                <button
                    onClick={handlePreview}
                    disabled={loading || selected.length === 0}
                    className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
                >
                    {loading ? 'Loading…' : 'Preview all episodes'}
                </button>
                <span className="text-sm text-gray-600">
                    Shows selected: {selected.length}
                </span>
            </div>

            {error && (
                <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {!loading && !error && preview.length === 0 && (
                <div className="text-sm text-gray-500">
                    No episodes loaded yet.
                </div>
            )}

            {preview.length > 0 && (
                <>
                    <div className="text-sm text-gray-600">
                        Episodes loaded: {preview.length}
                    </div>
                    <ol className="list-decimal pl-6 space-y-1 max-h-[480px] overflow-auto border rounded p-3">
                        {preview.map((e) => (
                            <li
                                key={`${e.showTitle}-${e.ratingKey}`}
                                className="text-sm"
                            >
                                <span className="font-medium">
                                    {e.showTitle}
                                </span>{' '}
                                · S{e.season}E{e.episode} — {e.title}
                            </li>
                        ))}
                    </ol>
                </>
            )}
            <div className="flex items-center gap-2 justify-center">
                <input
                    value={playlistName}
                    type="text"
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="Enter playlist name"
                    className="rounded border px-3 py-2"
                />
                <button
                    disabled={playlistName.trim().length === 0}
                    onClick={async () => {
                        const episodeKeys = preview.map((e) => e.ratingKey);
                        const res = await fetch('/api/playlist/build', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: playlistName,
                                episodeKeys,
                            }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                            return alert(
                                data.error || 'Failed to build playlist'
                            );
                        }
                        alert(`Created playlist with ${data.added} items`);
                        setPlaylistName('');
                        setPreview([]);
                    }}
                    className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                >
                    Create Playlist
                </button>
            </div>
        </section>
    );
}
