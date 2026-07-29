'use client';
import { useState, useEffect, useCallback } from 'react';

export default function PlaylistsPanel({ refreshKey, onEditPlaylist }) {
    const [playlists, setPlaylists] = useState([]);
    const [authInvalid, setAuthInvalid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deletingKey, setDeletingKey] = useState(null);

    // keyed by playlistKey: { savedAt, count } | null
    const [savepoints, setSavepoints] = useState({});
    const [savepointLoadingKey, setSavepointLoadingKey] = useState(null);
    const [restoringKey, setRestoringKey] = useState(null);

    const fetchPlaylists = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/playlists', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to load playlists.');
            const data = await res.json();
            const lists = data.playlists || [];
            setPlaylists(lists);
            setAuthInvalid(!!data.authInvalid);

            const spResults = await Promise.all(
                lists.map((p) =>
                    fetch(`/api/playlists/${p.playlistKey}/savepoint`, { cache: 'no-store' })
                        .then((r) => (r.ok ? r.json() : { savepoint: null }))
                        .then((d) => [p.playlistKey, d.savepoint])
                        .catch(() => [p.playlistKey, null])
                )
            );
            setSavepoints(Object.fromEntries(spResults));
        } catch (e) {
            setError(e.message || 'Server error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlaylists();
    }, [fetchPlaylists, refreshKey]);

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

    async function reconnect() {
        await fetch('/api/playlists/auto-update/reauth', { method: 'POST' });
        await fetchPlaylists();
    }

    async function deletePlaylist(p) {
        if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
        setDeletingKey(p.playlistKey);
        try {
            await fetch(`/api/playlists/${p.playlistKey}`, { method: 'DELETE' });
            await fetchPlaylists();
        } finally {
            setDeletingKey(null);
        }
    }

    async function saveSavepoint(playlistKey) {
        setSavepointLoadingKey(playlistKey);
        try {
            const res = await fetch(`/api/playlists/${playlistKey}/savepoint`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to save save point.');
            const spRes = await fetch(`/api/playlists/${playlistKey}/savepoint`, { cache: 'no-store' });
            if (spRes.ok) {
                const spData = await spRes.json();
                setSavepoints((prev) => ({ ...prev, [playlistKey]: spData.savepoint }));
            }
        } finally {
            setSavepointLoadingKey(null);
        }
    }

    async function restoreSavepoint(playlistKey) {
        if (!window.confirm('Reset playlist to save point? This will replace the current contents.')) return;
        setRestoringKey(playlistKey);
        try {
            const res = await fetch(`/api/playlists/${playlistKey}/savepoint/restore`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to restore save point.');
        } finally {
            setRestoringKey(null);
        }
    }

    return (
        <section className="mt-4 space-y-3">
            {authInvalid && (
                <div className="flex items-center justify-between rounded border border-red-300 bg-red-50 p-3 text-sm">
                    <span>
                        Auto-update lost access to your Plex account. Reconnect to resume.
                    </span>
                    <button onClick={reconnect} className="rounded bg-black px-3 py-1 text-white">
                        Reconnect auto-update
                    </button>
                </div>
            )}
            {loading && <div>Loading…</div>}
            {error && <div className="text-sm text-red-600">{error}</div>}
            {!loading && !error && playlists.length === 0 && (
                <div className="text-sm text-gray-600">No playlists found on this server.</div>
            )}
            <ul className="space-y-2">
                {playlists.map((p) => {
                    const sp = savepoints[p.playlistKey];
                    return (
                        <li key={p.playlistKey} className="rounded border p-3 space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{p.title}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleAutoUpdate(p)}
                                        className={`rounded px-3 py-1 text-sm text-white ${p.autoUpdateEnabled ? 'bg-black' : 'bg-gray-400'}`}
                                    >
                                        {p.autoUpdateEnabled ? 'Auto-update: On' : 'Auto-update: Off'}
                                    </button>
                                    <button
                                        onClick={() => onEditPlaylist(p.playlistKey, p.title)}
                                        className="rounded bg-gray-200 px-3 py-1 text-sm"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => deletePlaylist(p)}
                                        disabled={deletingKey === p.playlistKey}
                                        className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 disabled:opacity-50"
                                    >
                                        {deletingKey === p.playlistKey ? 'Deleting…' : 'Delete'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => saveSavepoint(p.playlistKey)}
                                        disabled={savepointLoadingKey === p.playlistKey}
                                        className="rounded bg-gray-100 px-3 py-1 text-sm disabled:opacity-50"
                                    >
                                        {savepointLoadingKey === p.playlistKey ? 'Saving…' : 'Set save point'}
                                    </button>
                                    {sp && (
                                        <button
                                            onClick={() => restoreSavepoint(p.playlistKey)}
                                            disabled={restoringKey === p.playlistKey}
                                            className="rounded bg-amber-100 px-3 py-1 text-sm text-amber-800 disabled:opacity-50"
                                        >
                                            {restoringKey === p.playlistKey
                                                ? 'Restoring…'
                                                : `Reset to save point (${sp.count} ep, ${new Date(sp.savedAt).toLocaleDateString()})`}
                                        </button>
                                    )}
                                </div>
                                {p.autoUpdateEnabled && (
                                    <div className="text-xs text-gray-500 text-right">
                                        {p.lastPolledAt && (
                                            <div>Last checked: {new Date(p.lastPolledAt).toLocaleString()}</div>
                                        )}
                                        {p.lastError && (
                                            <div className="text-red-600">{p.lastError}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
