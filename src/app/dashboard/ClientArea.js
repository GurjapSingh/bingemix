'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import SearchPanel from './SearchPanel';
import PreviewPanel from './PreviewPanel';
import ServersPanel from './ServersPanel';
import LibrariesPanel from './LibrariesPanel';
import PlaylistsPanel from './PlaylistsPanel';
import { useRouter } from 'next/navigation';

export default function ClientArea() {
    const router = useRouter();
    const [selected, setSelected] = useState([]);
    const [playlistOrder, setPlaylistOrder] = useState('round-robin');
    const [serverTitle, setServerTitle] = useState(null);
    const [libraryTitle, setLibraryTitle] = useState(null);
    const [episodesByShow, setEpisodesByShow] = useState({});
    const [selectedEpisodes, setSelectedEpisodes] = useState({});
    const [episodesError, setEpisodesError] = useState('');
    const [playlistRefreshKey, setPlaylistRefreshKey] = useState(0);
    const [editingPlaylist, setEditingPlaylist] = useState(null);
    const fetchedShowsRef = useRef(new Set());
    const step3Ref = useRef(null);

    useEffect(() => {
        const missing = selected.filter(
            (s) => !fetchedShowsRef.current.has(s.ratingKey)
        );
        if (missing.length === 0) return;
        missing.forEach((s) => fetchedShowsRef.current.add(s.ratingKey));

        let cancelled = false;
        (async () => {
            try {
                const results = await Promise.all(
                    missing.map(async (show) => {
                        const res = await fetch(
                            `/api/shows/${show.ratingKey}/episodes`,
                            { cache: 'no-store' }
                        );
                        if (!res.ok) {
                            throw new Error(
                                `Error fetching episodes for ${show.title}`
                            );
                        }
                        const data = await res.json();
                        return [show.ratingKey, data.episodes ?? []];
                    })
                );
                if (cancelled) return;

                setEpisodesByShow((prev) => ({
                    ...prev,
                    ...Object.fromEntries(results),
                }));
                setSelectedEpisodes((prev) => {
                    const next = { ...prev };
                    for (const [ratingKey, episodes] of results) {
                        // Don't override a selection pre-seeded by edit mode
                        if (!(ratingKey in next)) {
                            next[ratingKey] = new Set(
                                episodes.map((ep) => ep.ratingKey)
                            );
                        }
                    }
                    return next;
                });
            } catch (err) {
                if (!cancelled) {
                    setEpisodesError(err.message || 'Error fetching episodes');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selected]);

    function toggleEpisode(showRatingKey, episodeRatingKey) {
        setSelectedEpisodes((prev) => {
            const current = new Set(prev[showRatingKey] ?? []);
            if (current.has(episodeRatingKey)) {
                current.delete(episodeRatingKey);
            } else {
                current.add(episodeRatingKey);
            }
            return { ...prev, [showRatingKey]: current };
        });
    }

    function toggleAllInSeason(showRatingKey, seasonEpisodes, checked) {
        setSelectedEpisodes((prev) => {
            const current = new Set(prev[showRatingKey] ?? []);
            for (const ep of seasonEpisodes) {
                if (checked) {
                    current.add(ep.ratingKey);
                } else {
                    current.delete(ep.ratingKey);
                }
            }
            return { ...prev, [showRatingKey]: current };
        });
    }

    const loadPlaylistForEdit = useCallback(async (playlistKey, title) => {
        const res = await fetch(`/api/playlists/${playlistKey}/items`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const items = data.items || [];

        const showsMap = new Map();
        const initialSelection = {};
        for (const item of items) {
            if (!item.showRatingKey) continue;
            if (!showsMap.has(item.showRatingKey)) {
                showsMap.set(item.showRatingKey, { ratingKey: item.showRatingKey, title: item.showTitle, year: null });
                initialSelection[item.showRatingKey] = new Set();
            }
            initialSelection[item.showRatingKey].add(item.ratingKey);
        }

        // Seed selections before setting selected so the fetch useEffect doesn't overwrite them
        setSelectedEpisodes(initialSelection);
        setSelected([...showsMap.values()]);
        setEditingPlaylist({ playlistKey, title });
        setTimeout(() => step3Ref.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    }, []);

    function cancelEdit() {
        setEditingPlaylist(null);
        setSelected([]);
        setSelectedEpisodes({});
        fetchedShowsRef.current = new Set();
    }

    async function doLibraryChange() {
        await fetch('/api/libraries/clear', {
            method: 'POST',
            cache: 'no-store',
        });
        setLibraryTitle(null);
        setSelected([]);
        router.refresh();
    }

    async function doServerChange() {
        await fetch('/api/libraries/clear', {
            method: 'POST',
            cache: 'no-store',
        });
        await fetch('/api/servers/clear', {
            method: 'POST',
            cache: 'no-store',
        });
        setSelected([]);
        setLibraryTitle(null);
        setServerTitle(null);
        router.refresh();
    }

    return (
        <section className="space-y-6">
            {/* 1. Check server cookie*/}
            <div className="rounded border p-4">
                <h2 className="font-semibold">Step 1: Choose a Plex server</h2>
                {serverTitle ? (
                    <>
                        <p className="text-sm text-gray-600">
                            Selected server: {serverTitle}
                        </p>
                        <button
                            onClick={doServerChange}
                            className="rounded bg-gray-200 px-3 py-1"
                        >
                            Change Server
                        </button>
                    </>
                ) : (
                    <ServersPanel onSelect={setServerTitle} />
                )}
            </div>

            {/* 2. check for selected library*/}
            {serverTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">Step 2: Choose a Library</h2>
                    {libraryTitle ? (
                        <>
                            <p className="text-sm text-gray-600">
                                Selected library: {libraryTitle}
                            </p>
                            <button
                                onClick={doLibraryChange}
                                className="rounded bg-gray-200 px-3 py-1"
                            >
                                Change Library
                            </button>
                        </>
                    ) : (
                        <LibrariesPanel onSelect={setLibraryTitle} />
                    )}
                </div>
            )}

            {/* 3. Search and preview */}
            {serverTitle && (libraryTitle || editingPlaylist) && (
                <div className="rounded border p-4" ref={step3Ref}>
                    <h2 className="font-semibold">
                        {editingPlaylist
                            ? `Editing: ${editingPlaylist.title}`
                            : 'Step 3: Search and select shows'}
                    </h2>
                    <SearchPanel
                        selected={selected}
                        onChangeSelected={setSelected}
                        playlistOrder={playlistOrder}
                        onChangePlaylistOrder={setPlaylistOrder}
                        episodesByShow={episodesByShow}
                        selectedEpisodes={selectedEpisodes}
                        onToggleEpisode={toggleEpisode}
                        onToggleAllInSeason={toggleAllInSeason}
                    />
                    <PreviewPanel
                        selected={selected}
                        playlistOrder={playlistOrder}
                        episodesByShow={episodesByShow}
                        selectedEpisodes={selectedEpisodes}
                        episodesError={episodesError}
                        onPlaylistCreated={() => {
                            setPlaylistRefreshKey((k) => k + 1);
                            cancelEdit();
                        }}
                        editingPlaylist={editingPlaylist}
                        onCancelEdit={cancelEdit}
                        onToggleEpisode={toggleEpisode}
                    />
                </div>
            )}

            {/* 4. Manage auto-update playlists */}
            {serverTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">
                        Manage Auto-Update Playlists
                    </h2>
                    <PlaylistsPanel
                        refreshKey={playlistRefreshKey}
                        onEditPlaylist={loadPlaylistForEdit}
                    />
                </div>
            )}
        </section>
    );
}
