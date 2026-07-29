'use client';

import { useState, useEffect, useRef } from 'react';

function ShowEpisodeSelector({ show, episodes, selectedEpisodes, onToggleEpisode, onToggleAllInSeason }) {
    const seasons = [...new Set(episodes.map((ep) => ep.season))].sort((a, b) => a - b);
    const [activeTab, setActiveTab] = useState(seasons[0] ?? null);

    if (seasons.length === 0) return null;

    const selectedEps = selectedEpisodes?.[show.ratingKey] ?? new Set();
    const seasonEpisodes = episodes.filter((ep) => ep.season === activeTab);
    const allSelected = seasonEpisodes.length > 0 && seasonEpisodes.every((ep) => selectedEps.has(ep.ratingKey));
    const someSelected = seasonEpisodes.some((ep) => selectedEps.has(ep.ratingKey));

    return (
        <div className="mt-2 border-t pt-2">
            <div className="flex gap-0 border-b">
                {seasons.map((s) => (
                    <button
                        key={s}
                        onClick={() => setActiveTab(s)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                            activeTab === s
                                ? 'border-b-2 border-blue-600 text-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Season {s}
                    </button>
                ))}
            </div>
            <div className="max-h-[260px] overflow-auto">
                <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                        <tr>
                            <th className="px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={(el) => {
                                        if (el) el.indeterminate = !allSelected && someSelected;
                                    }}
                                    onChange={(e) =>
                                        onToggleAllInSeason(show.ratingKey, seasonEpisodes, e.target.checked)
                                    }
                                />
                            </th>
                            <th className="px-3 py-2 text-gray-600">Ep</th>
                            <th className="px-3 py-2 text-gray-600">Title</th>
                        </tr>
                    </thead>
                    <tbody>
                        {seasonEpisodes.map((ep) => (
                            <tr
                                key={ep.ratingKey}
                                className="border-t hover:bg-gray-50 cursor-pointer"
                                onClick={() => onToggleEpisode(show.ratingKey, ep.ratingKey)}
                            >
                                <td className="px-3 py-1.5">
                                    <input
                                        type="checkbox"
                                        checked={selectedEps.has(ep.ratingKey)}
                                        onChange={() => onToggleEpisode(show.ratingKey, ep.ratingKey)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </td>
                                <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                                    E{ep.episode}
                                </td>
                                <td className="px-3 py-1.5">{ep.title}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function SearchPanel({
    selected,
    onChangeSelected,
    playlistOrder,
    onChangePlaylistOrder,
    episodesByShow,
    selectedEpisodes,
    onToggleEpisode,
    onToggleAllInSeason,
}) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef(null);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [results]);

    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setResults([]);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setError('');
            return;
        }
        const timer = setTimeout(async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(
                    `/api/search?query=${encodeURIComponent(trimmed)}`,
                    { cache: 'no-store' }
                );
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                setResults(data?.results || []);
            } catch (err) {
                setError(err.message || 'Search error');
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    function addShow(item) {
        if (selected.some((s) => s.ratingKey === item.ratingKey)) return;
        onChangeSelected([...selected, item]);
        setQuery('');
        setResults([]);
    }

    function handleKeyDown(e) {
        if (results.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addShow(results[highlightedIndex]);
        } else if (e.key === 'Escape') {
            setResults([]);
            setQuery('');
        }
    }

    function removeShow(key) {
        onChangeSelected(selected.filter((s) => s.ratingKey !== key));
    }

    return (
        <section className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold">Search Shows</h2>

            <div className="relative" ref={containerRef}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="text"
                    placeholder="Search by title (e.g., The Office)"
                    className="w-full rounded border px-3 py-2 pr-20"
                />
                {loading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        Searching…
                    </span>
                )}
                {error && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded border border-red-200 bg-white px-3 py-2 text-sm text-red-700 shadow">
                        {error}
                    </div>
                )}
                {!error && results.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded border bg-white shadow">
                        {results.map((r, i) => {
                            const alreadyAdded = selected.some((s) => s.ratingKey === r.ratingKey);
                            return (
                                <li
                                    key={r.ratingKey}
                                    onMouseDown={() => addShow(r)}
                                    onMouseEnter={() => setHighlightedIndex(i)}
                                    className={`flex cursor-pointer items-center justify-between px-3 py-2 ${
                                        i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <div>
                                        <div className="font-medium">{r.title}</div>
                                        <div className="text-xs text-gray-500">{r.year ?? '—'}</div>
                                    </div>
                                    {i === highlightedIndex && !alreadyAdded ? (
                                        <span className="text-xs text-gray-400">↵ to add</span>
                                    ) : alreadyAdded ? (
                                        <span className="text-xs text-gray-400">Added</span>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {!loading && !error && results.length === 0 && query.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded border bg-white px-3 py-2 text-sm text-gray-500 shadow">
                        No matches.
                    </div>
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
                                    {episodes.length === 0 ? (
                                        <div className="mt-2 border-t pt-2 text-xs text-gray-400">
                                            Loading episodes…
                                        </div>
                                    ) : (
                                        <ShowEpisodeSelector
                                            show={s}
                                            episodes={episodes}
                                            selectedEpisodes={selectedEpisodes}
                                            onToggleEpisode={onToggleEpisode}
                                            onToggleAllInSeason={onToggleAllInSeason}
                                        />
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
