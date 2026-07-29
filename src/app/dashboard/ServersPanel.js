'use client';
import { useState, useEffect } from 'react';

export default function ServersPanel({ onSelect }) {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [connectingId, setConnectingId] = useState(null);

    useEffect(() => {
        async function fetchServers() {
            setLoading(true);
            setError('');
            try {
                const res = await fetch('/api/servers', { cache: 'no-cache' });
                if (!res.ok) {
                    throw new Error('Failed to load servers.');
                }
                const data = await res.json();
                setServers(data);
            } catch (e) {
                setError(e.message || 'Server Error');
            } finally {
                setLoading(false);
            }
        }
        fetchServers();
    }, []);
    return (
        <section className="mt-4 space-y-3">
            <h2 className="font-semibold">Your Plex Servers</h2>
            {loading && <div>Loading…</div>}
            {error && <div className="text-red-600 text-sm">{error}</div>}
            {!loading && !error && servers.length === 0 && (
                <div className="text-sm text-gray-600">No servers found.</div>
            )}
            <ul className="space-y-2">
                {servers.map((s) => (
                    <li
                        key={s.machineId}
                        className="flex items-start justify-between rounded border p-3"
                    >
                        <div>
                            <div className="font-medium">{s.name}</div>
                            {s.connections?.length ? (
                                <ul className="mt-1 space-y-0.5">
                                    {s.connections.map((c) => (
                                        <li
                                            key={c.uri}
                                            className="text-xs text-gray-500"
                                        >
                                            <span
                                                className={`mr-1 rounded px-1 ${
                                                    c.local
                                                        ? 'bg-gray-200'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}
                                            >
                                                {c.local ? 'local' : 'remote'}
                                            </span>
                                            {c.uri}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-xs text-gray-500">
                                    No connections
                                </div>
                            )}
                        </div>
                        <button
                            disabled={connectingId === s.machineId}
                            className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
                            onClick={async () => {
                                setConnectingId(s.machineId);
                                setError('');
                                try {
                                    const res = await fetch(
                                        '/api/servers/select',
                                        {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type':
                                                    'application/json',
                                            },
                                            body: JSON.stringify({
                                                machineId: s.machineId,
                                                accessToken: s.accessToken,
                                                connections: s.connections,
                                            }),
                                        }
                                    );
                                    const data = await res.json();
                                    if (!res.ok) {
                                        throw new Error(
                                            data?.details ||
                                                data?.error ||
                                                'Could not reach this server.'
                                        );
                                    }
                                    onSelect(s.name);
                                } catch (e) {
                                    setError(e.message || 'Server Error');
                                } finally {
                                    setConnectingId(null);
                                }
                            }}
                        >
                            {connectingId === s.machineId
                                ? 'Connecting…'
                                : 'Select'}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
