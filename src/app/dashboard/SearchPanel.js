'use client';

import { useState } from 'react';

export default function SearchPanel({
    selected,
    onChangeSelected,
    playlistOrder,
    onChangePlaylistOrder,
    episodesByShow,
    selectedSeasons,
    onToggleSeason,
}) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState([]);

    async function doSearch() {
        if (!query.trim()) return;
        setLoading(true);
        setError('');
        setResults([]);

        try {
            const res = await fetch(
                `/api/search?query=${encodeURIComponent(query)}`,
                { cache: 'no-store' }
            );
            if (!res.ok) {
                throw new Error('Search failed');
            }
            const data = await res.json();
            setResults(data?.results || []);
        } catch (error) {
            setError(error.message || 'Search error');
        } finally {
            setLoading(false);
        }
    }

    function addShow(item) {
        if (selected.some((s) => s.ratingKey === item.ratingKey)) return;
        onChangeSelected([...selected, item]);
        setQuery('');
        setResults([]);
    }

    function removeShow(key) {
        onChangeSelected(selected.filter((s) => s.ratingKey !== key));
    }

    return (
        <section className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold">Search Shows</h2>

            <div className="flex gap-2">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                    type="text"
                    placeholder="Search by title (e.g., The Office)"
                    className="flex-1 rounded border px-3 py-2"
                />
                <button
                    onClick={doSearch}
                    className="rounded bg-black px-4 py-2 text-white"
                >
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </div>
            {error && (
                <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}
            <div className="space-y-2">
                {results.length > 0 && (
                    <div className="text-sm text-gray-600">
                        Results ({results.length})
                    </div>
                )}
                <ul className="space-y-2">
                    {results.map((r) => (
                        <li
                            key={r.ratingKey}
                            className="flex items-center justify-between rounded border p-3 hover:bg-gray-50"
                        >
                            <div>
                                <div className="font-medium">{r.title}</div>
                                <div className="text-xs text-gray-500">
                                    {r.year ?? '—'} · Key: {r.ratingKey}
                                </div>
                            </div>
                            <button
                                onClick={() => addShow(r)}
                                disabled={selected.some(
                                    (s) => s.ratingKey === r.ratingKey
                                )}
                                className="rounded bg-blue-600 px-3 py-1 text-white"
                            >
                                {selected.some(
                                    (s) => s.ratingKey === r.ratingKey
                                )
                                    ? 'Added'
                                    : 'Add'}
                            </button>
                        </li>
                    ))}
                </ul>
                {!loading && !error && results.length === 0 && query && (
                    <div className="text-sm text-gray-500">No matches.</div>
                )}
            </div>
            <div className="pt-4 space-y-4">
                <h3 className="font-semibold">Selected Shows Settings</h3>
                {selected.length === 0 ? (
                    <div className="text-sm text-gray-500">
                        Nothing selected yet.
                    </div>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {selected.map((s) => {
                            const episodes = episodesByShow?.[s.ratingKey] ?? [];
                            const seasons = [
                                ...new Set(episodes.map((ep) => ep.season)),
                            ].sort((a, b) => a - b);
                            const checkedSeasons = selectedSeasons?.[s.ratingKey];

                            return (
                                <li
                                    key={s.ratingKey}
                                    className="rounded border p-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium">
                                                {s.title}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {s.year ?? '—'} · Key:{' '}
                                                {s.ratingKey}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() =>
                                                removeShow(s.ratingKey)
                                            }
                                            className="rounded bg-gray-200 px-3 py-1 text-gray-800 hover:bg-gray-300"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                    {seasons.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-3 border-t pt-2">
                                            {seasons.map((season) => (
                                                <label
                                                    key={season}
                                                    className="flex items-center gap-1 text-xs"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            checkedSeasons?.has(
                                                                season
                                                            ) ?? true
                                                        }
                                                        onChange={() =>
                                                            onToggleSeason(
                                                                s.ratingKey,
                                                                season
                                                            )
                                                        }
                                                    />
                                                    Season {season}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="space-y-2">
                    <div className="text-sm font-medium">Playlist order</div>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                name="playlistOrder"
                                value="round-robin"
                                checked={playlistOrder === 'round-robin'}
                                onChange={() =>
                                    onChangePlaylistOrder('round-robin')
                                }
                            />
                            Round robin
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                name="playlistOrder"
                                value="random"
                                checked={playlistOrder === 'random'}
                                onChange={() =>
                                    onChangePlaylistOrder('random')
                                }
                            />
                            Random
                        </label>
                    </div>
                </div>
            </div>
        </section>
    );
}
