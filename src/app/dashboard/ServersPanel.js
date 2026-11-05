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
            <p className="text-sm muted">Choose the Plex server to build playlists on.</p>
            {loading && <div className="text-sm muted">Loading…</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            {!loading && !error && servers.length === 0 && (
                <div className="text-sm muted">No servers found.</div>
            )}
            <ul className="space-y-2">
                {servers.map((s) => (
                    <li
                        key={s.machineId}
                        className="row flex items-start justify-between gap-4"
                    >
                        <div className="min-w-0">
                            <div className="font-semibold">{s.name}</div>
                            <div className="mt-1.5 flex gap-1.5">
                                {s.hasLocal && <span className="chip">Local network</span>}
                                {s.hasRemote && (
                                    <span className="chip chip-accent">Remote access</span>
                                )}
                                {!s.hasLocal && !s.hasRemote && (
                                    <span className="text-xs muted">No connections</span>
                                )}
                            </div>
                        </div>
                        <button
                            disabled={connectingId === s.machineId}
                            className="btn btn-primary btn-sm"
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
