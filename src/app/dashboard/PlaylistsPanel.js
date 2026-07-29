'use client';
import { useState, useEffect, useCallback } from 'react';

export default function PlaylistsPanel() {
    const [playlists, setPlaylists] = useState([]);
    const [authInvalid, setAuthInvalid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [runningKey, setRunningKey] = useState(null);

    const [editingKey, setEditingKey] = useState(null);
    const [editItems, setEditItems] = useState([]);
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');
    const [saving, setSaving] = useState(false);

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

    async function startEdit(p) {
        setEditingKey(p.playlistKey);
        setEditItems([]);
        setEditError('');
        setEditLoading(true);
        try {
            const res = await fetch(
                `/api/playlists/${p.playlistKey}/items`,
                { cache: 'no-store' }
            );
            if (!res.ok) throw new Error('Failed to load playlist items.');
            const data = await res.json();
            setEditItems(data.items || []);
        } catch (e) {
            setEditError(e.message || 'Server error');
        } finally {
            setEditLoading(false);
        }
    }

    function cancelEdit() {
        setEditingKey(null);
        setEditItems([]);
        setEditError('');
    }

    function removeItem(index) {
        setEditItems((items) => items.filter((_, i) => i !== index));
    }

    function moveItem(index, direction) {
        setEditItems((items) => {
            const target = index + direction;
            if (target < 0 || target >= items.length) return items;
            const next = [...items];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    async function saveEdit() {
        setSaving(true);
        setEditError('');
        try {
            const res = await fetch(
                `/api/playlists/${editingKey}/items`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        order: editItems.map((i) => i.playlistItemID),
                    }),
                }
            );
            if (!res.ok) throw new Error('Failed to save changes.');
            cancelEdit();
            await fetchPlaylists();
        } catch (e) {
            setEditError(e.message || 'Server error');
        } finally {
            setSaving(false);
        }
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
                {playlists.map((p) => {
                    const isEditing = editingKey === p.playlistKey;
                    return (
                        <li
                            key={p.playlistKey}
                            className="rounded border p-3 space-y-1"
                        >
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() =>
                                        isEditing
                                            ? cancelEdit()
                                            : startEdit(p)
                                    }
                                    className="font-medium underline decoration-dotted underline-offset-2"
                                >
                                    {p.title}
                                </button>
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
                                    <button
                                        onClick={() =>
                                            isEditing
                                                ? cancelEdit()
                                                : startEdit(p)
                                        }
                                        className="rounded bg-gray-200 px-3 py-1 text-sm"
                                    >
                                        {isEditing ? 'Close' : 'Edit'}
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

                            {isEditing && (
                                <div className="mt-2 space-y-3 border-t pt-3">
                                    {editLoading && <div>Loading items…</div>}
                                    {editError && (
                                        <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
                                            {editError}
                                        </div>
                                    )}
                                    {!editLoading && editItems.length === 0 && !editError && (
                                        <div className="text-sm text-gray-500">
                                            This playlist is empty.
                                        </div>
                                    )}
                                    {!editLoading && editItems.length > 0 && (
                                        <div className="max-h-[400px] overflow-auto rounded border">
                                            <table className="w-full text-left text-sm">
                                                <thead className="sticky top-0 bg-gray-100">
                                                    <tr>
                                                        <th className="px-3 py-2">
                                                            #
                                                        </th>
                                                        <th className="px-3 py-2">
                                                            Show
                                                        </th>
                                                        <th className="px-3 py-2">
                                                            Episode
                                                        </th>
                                                        <th className="px-3 py-2">
                                                            Title
                                                        </th>
                                                        <th className="px-3 py-2" />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {editItems.map(
                                                        (item, i) => (
                                                            <tr
                                                                key={
                                                                    item.playlistItemID
                                                                }
                                                                className="border-t"
                                                            >
                                                                <td className="px-3 py-2 text-gray-500">
                                                                    {i + 1}
                                                                </td>
                                                                <td className="px-3 py-2 font-medium">
                                                                    {
                                                                        item.showTitle
                                                                    }
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    S
                                                                    {
                                                                        item.season
                                                                    }
                                                                    E
                                                                    {
                                                                        item.episode
                                                                    }
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {
                                                                        item.title
                                                                    }
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            disabled={
                                                                                i ===
                                                                                0
                                                                            }
                                                                            onClick={() =>
                                                                                moveItem(
                                                                                    i,
                                                                                    -1
                                                                                )
                                                                            }
                                                                            className="rounded bg-gray-200 px-2 py-1 text-xs disabled:opacity-40"
                                                                        >
                                                                            ▲
                                                                        </button>
                                                                        <button
                                                                            disabled={
                                                                                i ===
                                                                                editItems.length -
                                                                                    1
                                                                            }
                                                                            onClick={() =>
                                                                                moveItem(
                                                                                    i,
                                                                                    1
                                                                                )
                                                                            }
                                                                            className="rounded bg-gray-200 px-2 py-1 text-xs disabled:opacity-40"
                                                                        >
                                                                            ▼
                                                                        </button>
                                                                        <button
                                                                            onClick={() =>
                                                                                removeItem(
                                                                                    i
                                                                                )
                                                                            }
                                                                            className="rounded bg-red-100 px-2 py-1 text-xs text-red-700"
                                                                        >
                                                                            Remove
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={cancelEdit}
                                            disabled={saving}
                                            className="rounded bg-gray-200 px-3 py-1 text-sm disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={saveEdit}
                                            disabled={saving || editLoading}
                                            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                                        >
                                            {saving
                                                ? 'Saving…'
                                                : 'Save changes'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
