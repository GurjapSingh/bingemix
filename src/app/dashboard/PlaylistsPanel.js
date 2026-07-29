'use client';
import { useState, useEffect, useCallback } from 'react';

export default function PlaylistsPanel() {
    const [playlists, setPlaylists] = useState([]);
    const [authInvalid, setAuthInvalid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [runningKey, setRunningKey] = useState(null);

    const fetchPlaylists = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/playlists', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to load playlists.');
            const data = await res.json();
            setPlaylists(data.playlists || []);
            setAuthInvalid(!!data.authInvalid);
        } catch (e) {
            setError(e.message || 'Server error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlaylists();
    }, [fetchPlaylists]);

    async function toggleAutoUpdate(p) {
        await fetch('/api/playlists/auto-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playlistKey: p.playlistKey,
                title: p.title,
                enabled: !p.autoUpdateEnabled,
            }),
        });
        await fetchPlaylists();
    }

    async function runNow(p) {
        setRunningKey(p.playlistKey);
        try {
            await fetch('/api/playlists/auto-update/run', { method: 'POST' });
            await fetchPlaylists();
        } finally {
            setRunningKey(null);
        }
    }

    async function reconnect() {
        await fetch('/api/playlists/auto-update/reauth', { method: 'POST' });
        await fetchPlaylists();
    }

    return (
        <section className="mt-4 space-y-3">
            {authInvalid && (
                <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-3 text-sm">
                    <span>
                        Auto-update lost access to your Plex account. Reconnect
                        to resume.
                    </span>
                    <button
                        onClick={reconnect}
                        className="rounded bg-black px-3 py-1 text-white"
                    >
                        Reconnect auto-update
                    </button>
                </div>
            )}
            {loading && <div>Loading…</div>}
            {error && <div className="text-sm text-red-600">{error}</div>}
            {!loading && !error && playlists.length === 0 && (
                <div className="text-sm text-gray-600">
                    No playlists found on this server.
                </div>
            )}
            <ul className="space-y-2">
                {playlists.map((p) => (
                    <li
                        key={p.playlistKey}
                        className="rounded border p-3 space-y-1"
                    >
                        <div className="flex items-center justify-between">
                            <div className="font-medium">{p.title}</div>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={
                                        !p.autoUpdateEnabled ||
                                        runningKey === p.playlistKey
                                    }
                                    onClick={() => runNow(p)}
                                    className="rounded bg-gray-200 px-3 py-1 text-sm disabled:opacity-50"
                                >
                                    {runningKey === p.playlistKey
                                        ? 'Running…'
                                        : 'Run now'}
                                </button>
                                <button
                                    onClick={() => toggleAutoUpdate(p)}
                                    className={`rounded px-3 py-1 text-sm text-white ${
                                        p.autoUpdateEnabled
                                            ? 'bg-black'
                                            : 'bg-gray-400'
                                    }`}
                                >
                                    {p.autoUpdateEnabled
                                        ? 'Auto-update: On'
                                        : 'Auto-update: Off'}
                                </button>
                            </div>
                        </div>
                        {p.autoUpdateEnabled && (
                            <div className="text-xs text-gray-500 space-y-0.5">
                                {p.watchedPlaylistTitle && (
                                    <div>
                                        Watched items move to:{' '}
                                        {p.watchedPlaylistTitle}
                                    </div>
                                )}
                                {p.lastPolledAt && (
                                    <div>
                                        Last checked:{' '}
                                        {new Date(
                                            p.lastPolledAt
                                        ).toLocaleString()}
                                    </div>
                                )}
                                {p.lastError && (
                                    <div className="text-red-600">
                                        {p.lastError}
                                    </div>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
