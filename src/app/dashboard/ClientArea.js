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
    const [editNotice, setEditNotice] = useState('');
    // True while a playlist is being created/updated: reordering is locked.
    const [saving, setSaving] = useState(false);
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
        setEditingPlaylist({
            playlistKey,
            title,
            order: items.map((i) => String(i.ratingKey)),
        });
        setTimeout(() => step3Ref.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    }, []);

    // A save point restore changes the playlist on the server, so the edit
    // view (a snapshot taken when editing began) must be reloaded.
    async function handlePlaylistRestored(playlistKey) {
        if (editingPlaylist?.playlistKey !== playlistKey) return;
        await loadPlaylistForEdit(playlistKey, editingPlaylist.title);
        setEditNotice('Playlist was reset to its save point. The edit view has been reloaded.');
    }

    function cancelEdit() {
        setEditingPlaylist(null);
        setEditNotice('');
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
        <section className="space-y-5">
            {/* Steps 1-2: full cards while choosing, one slim bar once both are done */}
            {serverTitle && (libraryTitle || editingPlaylist) ? (
                <div className="card divide-y divide-[var(--border)] py-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                        <span className="step-badge">Step 1</span>
                        <span className="muted text-sm">Plex server</span>
                        <span className="font-semibold">{serverTitle}</span>
                        <button
                            onClick={doServerChange}
                            className="btn btn-ghost btn-sm"
                        >
                            Change
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                        <span className="step-badge">Step 2</span>
                        <span className="muted text-sm">Library</span>
                        {libraryTitle ? (
                            <>
                                <span className="font-semibold">{libraryTitle}</span>
                                <button
                                    onClick={doLibraryChange}
                                    className="btn btn-ghost btn-sm"
                                >
                                    Change
                                </button>
                            </>
                        ) : (
                            <span className="muted text-sm">
                                Not needed while editing a playlist
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <>
            <div className="card">
                <h2 className="card-title"><span className="step-badge">Step 1</span>Choose a Plex server</h2>
                {serverTitle ? (
                    <>
                        <p className="text-sm muted mt-2">
                            Selected server: {serverTitle}
                        </p>
                        <button
                            onClick={doServerChange}
                            className="btn btn-secondary btn-sm mt-3"
                        >
                            Change Server
                        </button>
                    </>
                ) : (
                    <ServersPanel onSelect={setServerTitle} />
                )}
            </div>

            {serverTitle && (
                <div className="card">
                    <h2 className="card-title"><span className="step-badge">Step 2</span>Choose a library</h2>
                    {libraryTitle ? (
                        <>
                            <p className="text-sm muted mt-2">
                                Selected library: {libraryTitle}
                            </p>
                            <button
                                onClick={doLibraryChange}
                                className="btn btn-secondary btn-sm mt-3"
                            >
                                Change Library
                            </button>
                        </>
                    ) : (
                        <LibrariesPanel onSelect={setLibraryTitle} />
                    )}
                </div>
            )}

                </>
            )}

            {/* 3. Search and preview */}
            {serverTitle && (libraryTitle || editingPlaylist) && (
                <div className="card" ref={step3Ref}>
                    <h2 className="card-title">
                        {editingPlaylist ? (
                            `Editing: ${editingPlaylist.title}`
                        ) : (
                            <>
                                <span className="step-badge">Step 3</span>
                                Search and select shows
                            </>
                        )}
                    </h2>
                    {editingPlaylist && editNotice && (
                        <div className="alert mb-3">{editNotice}</div>
                    )}
                    <SearchPanel
                        locked={saving}
                        selected={selected}
                        onChangeSelected={setSelected}
                        episodesByShow={episodesByShow}
                        selectedEpisodes={selectedEpisodes}
                        onToggleEpisode={toggleEpisode}
                        onToggleAllInSeason={toggleAllInSeason}
                    />
                    <PreviewPanel
                        onBusyChange={setSaving}
                        selected={selected}
                        playlistOrder={playlistOrder}
                        onChangePlaylistOrder={setPlaylistOrder}
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

            {/* 4. Existing playlists */}
            {serverTitle && (
                <div className="card">
                    <h2 className="card-title">
                        Existing playlists
                    </h2>
                    <PlaylistsPanel
                        refreshKey={playlistRefreshKey}
                        onEditPlaylist={(key, title) => {
                            setEditNotice('');
                            return loadPlaylistForEdit(key, title);
                        }}
                        editingPlaylistKey={editingPlaylist?.playlistKey ?? null}
                        onRestored={handlePlaylistRestored}
                    />
                </div>
            )}
        </section>
    );
}
