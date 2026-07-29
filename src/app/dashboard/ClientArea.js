'use client';

import { useEffect, useRef, useState } from 'react';
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
    const [selectedSeasons, setSelectedSeasons] = useState({});
    const [episodesError, setEpisodesError] = useState('');
    const fetchedShowsRef = useRef(new Set());

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
                setSelectedSeasons((prev) => {
                    const next = { ...prev };
                    for (const [ratingKey, episodes] of results) {
                        next[ratingKey] = new Set(
                            episodes.map((ep) => ep.season)
                        );
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

    function toggleSeason(ratingKey, season) {
        setSelectedSeasons((prev) => {
            const current = new Set(prev[ratingKey] ?? []);
            if (current.has(season)) {
                current.delete(season);
            } else {
                current.add(season);
            }
            return { ...prev, [ratingKey]: current };
        });
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
            {serverTitle && libraryTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">
                        Step 3: Search and select shows
                    </h2>
                    <SearchPanel
                        selected={selected}
                        onChangeSelected={setSelected}
                        playlistOrder={playlistOrder}
                        onChangePlaylistOrder={setPlaylistOrder}
                        episodesByShow={episodesByShow}
                        selectedSeasons={selectedSeasons}
                        onToggleSeason={toggleSeason}
                    />
                    <PreviewPanel
                        selected={selected}
                        playlistOrder={playlistOrder}
                        episodesByShow={episodesByShow}
                        selectedSeasons={selectedSeasons}
                        episodesError={episodesError}
                    />
                </div>
            )}

            {/* 4. Manage auto-update playlists */}
            {serverTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">
                        Manage Auto-Update Playlists
                    </h2>
                    <PlaylistsPanel />
                </div>
            )}
        </section>
    );
}
