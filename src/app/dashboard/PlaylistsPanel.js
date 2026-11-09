'use client';
import { useState, useEffect, useCallback } from 'react';

function timeAgo(iso) {
    if (!iso) return 'unknown';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)} days ago`;
}

export default function PlaylistsPanel({ refreshKey, onEditPlaylist, editingPlaylistKey, onRestored }) {
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
        const beingEdited = editingPlaylistKey === playlistKey;
        const msg = beingEdited
            ? 'Reset playlist to save point? This will replace the current contents and discard any unsaved changes in the edit view.'
            : 'Reset playlist to save point? This will replace the current contents.';
        if (!window.confirm(msg)) return;
        setRestoringKey(playlistKey);
        try {
            const res = await fetch(`/api/playlists/${playlistKey}/savepoint/restore`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to restore save point.');
            await fetchPlaylists();
            await onRestored?.(playlistKey);
        } finally {
            setRestoringKey(null);
        }
    }

    return (
        <section className="mt-4 space-y-3">
            <p className="text-sm muted">
                Turn on auto-update and watched episodes are removed from the
                playlist automatically, so it always shows what&apos;s left to
                watch.
            </p>
            {authInvalid && (
                <div className="alert alert-danger flex items-center justify-between gap-3">
                    <span>
                        Auto-update lost access to your Plex account. Reconnect to resume.
                    </span>
                    <button onClick={reconnect} className="btn btn-primary btn-sm">
                        Reconnect auto-update
                    </button>
                </div>
            )}
            {loading && <div>Loading…</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            {!loading && !error && playlists.length === 0 && (
                <div className="text-sm muted">No playlists found on this server.</div>
            )}
            <ul className="space-y-2">
                {playlists.map((p) => {
                    const sp = savepoints[p.playlistKey];
                    return (
                        <li key={p.playlistKey} className="row space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold">{p.title}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        role="switch"
                                        aria-checked={!!p.autoUpdateEnabled}
                                        onClick={() => toggleAutoUpdate(p)}
                                        title={
                                            p.autoUpdateEnabled
                                                ? 'Click to turn auto-update off'
                                                : 'Click to turn auto-update on'
                                        }
                                        className="mr-1 flex items-center gap-2 text-sm"
                                    >
                                        <span className="text-sm">Auto-update</span>
                                        <span
                                            className="switch"
                                            data-on={!!p.autoUpdateEnabled}
                                        >
                                            <span />
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => onEditPlaylist(p.playlistKey, p.title)}
                                        className="btn btn-secondary btn-sm"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => deletePlaylist(p)}
                                        disabled={deletingKey === p.playlistKey}
                                        className="btn btn-danger btn-sm"
                                    >
                                        {deletingKey === p.playlistKey ? 'Deleting…' : 'Delete'}
                                    </button>
                                </div>
                            </div>

                            {p.externalAutoUpdate && (
                                <div className="alert alert-warn text-xs">
                                    {p.externalAutoUpdate.stale ? (
                                        <>
                                            Was auto-updated by another Bingemix (
                                            {p.externalAutoUpdate.host}, id:{p.externalAutoUpdate.instanceId}), last
                                            checked {timeAgo(p.externalAutoUpdate.lastChecked)}. It may
                                            have stopped.
                                        </>
                                    ) : (
                                        <>
                                            Already being auto-updated by another Bingemix ({p.externalAutoUpdate.host}, id:{p.externalAutoUpdate.instanceId}), last
                                            checked {timeAgo(p.externalAutoUpdate.lastChecked)}.
                                            {!p.autoUpdateEnabled
                                                ? ' Turning it on here would run it twice.'
                                                : ' It is also on here, so both are running.'}
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => saveSavepoint(p.playlistKey)}
                                        disabled={savepointLoadingKey === p.playlistKey}
                                        className="btn btn-ghost btn-sm"
                                        title="Remember the playlist as it is now, so you can reset it to this later"
                                    >
                                        {savepointLoadingKey === p.playlistKey ? 'Saving…' : 'Set save point'}
                                    </button>
                                    {sp && (
                                        <button
                                            onClick={() => restoreSavepoint(p.playlistKey)}
                                            disabled={restoringKey === p.playlistKey}
                                            className="btn btn-warn btn-sm"
                                        >
                                            {restoringKey === p.playlistKey
                                                ? 'Restoring…'
                                                : `Reset to save point (${sp.count} ep, ${new Date(sp.savedAt).toLocaleDateString()})`}
                                        </button>
                                    )}
                                </div>
                                {p.autoUpdateEnabled && (
                                    <div className="text-xs muted text-right">
                                        {p.lastPolledAt && (
                                            <div>Last checked: {new Date(p.lastPolledAt).toLocaleString()}</div>
                                        )}
                                        {p.lastError && (
                                            <div className="text-red-500">{p.lastError}</div>
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
