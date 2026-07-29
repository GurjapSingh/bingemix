'use client';

import { useEffect, useState } from 'react';

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
    return mixedEpisodes;
}

function buildRandomPlaylist(showsAndEpisodes) {
    const allEpisodes = showsAndEpisodes.flatMap((show) =>
        show.episodes.map((ep) => ({ ...ep, showTitle: show.title }))
    );

    for (let i = allEpisodes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allEpisodes[i], allEpisodes[j]] = [allEpisodes[j], allEpisodes[i]];
    }
    return allEpisodes;
}

export default function PreviewPanel({
    selected,
    playlistOrder,
    episodesByShow,
    selectedEpisodes,
    episodesError,
    onPlaylistCreated,
}) {
    const [preview, setPreview] = useState([]);
    const [playlistName, setPlaylistName] = useState('');

    useEffect(() => {
        const showsAndEpisodes = selected
            .map((show) => {
                const episodes = episodesByShow?.[show.ratingKey] ?? [];
                const selectedEps = selectedEpisodes?.[show.ratingKey];
                const filtered = selectedEps
                    ? episodes.filter((ep) => selectedEps.has(ep.ratingKey))
                    : episodes;
                return { ...show, episodes: filtered };
            })
            .filter((show) => show.episodes.length > 0);

        setPreview(
            playlistOrder === 'random'
                ? buildRandomPlaylist(showsAndEpisodes)
                : buildRoundRobinPlaylist(showsAndEpisodes)
        );
    }, [selected, playlistOrder, episodesByShow, selectedEpisodes]);

    function removeFromPreview(index) {
        setPreview((items) => items.filter((_, i) => i !== index));
    }

    return (
        <section className="mt-8 space-y-3">
            <div className="text-sm text-gray-600">
                Shows selected: {selected.length}
            </div>

            {episodesError && (
                <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
                    {episodesError}
                </div>
            )}

            {preview.length === 0 ? (
                <div className="text-sm text-gray-500">
                    No episodes loaded yet.
                </div>
            ) : (
                <>
                    <div className="text-sm text-gray-600">
                        Episodes loaded: {preview.length}
                    </div>
                    <div className="max-h-[480px] overflow-auto rounded border">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 bg-gray-100">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Show</th>
                                    <th className="px-3 py-2">Episode</th>
                                    <th className="px-3 py-2">Title</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {preview.map((e, i) => (
                                    <tr
                                        key={`${e.showTitle}-${e.ratingKey}-${i}`}
                                        className="border-t"
                                    >
                                        <td className="px-3 py-2 text-gray-500">
                                            {i + 1}
                                        </td>
                                        <td className="px-3 py-2 font-medium">
                                            {e.showTitle}
                                        </td>
                                        <td className="px-3 py-2">
                                            S{e.season}E{e.episode}
                                        </td>
                                        <td className="px-3 py-2">
                                            {e.title}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => removeFromPreview(i)}
                                                className="rounded bg-red-100 px-2 py-1 text-xs text-red-700"
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
                        onPlaylistCreated?.();
                    }}
                    className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                >
                    Create Playlist
                </button>
            </div>
        </section>
    );
}
