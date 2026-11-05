'use client';
import { useState, useEffect } from 'react';

export default function LibrariesPanel({ onSelect }) {
    const [libraries, setLibraries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function fetchLibraries() {
            try {
                const res = await fetch('/api/libraries', {
                    cache: 'no-store',
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(
                        data?.details ||
                            data?.error ||
                            'Failed to load libraries'
                    );
                }

                setLibraries(data?.tvLibraries || []);
            } catch (e) {
                setError(e.message || 'Libraries Error');
            } finally {
                setLoading(false);
            }
        }
        fetchLibraries();
    }, []);

    return (
        <section className="mt-4 space-y-3">
            <p className="text-sm muted">Pick the TV library to build playlists from.</p>

            {loading && <div className="muted">Loading libraries…</div>}
            {error && (
                <div className="alert alert-danger">
                    {error}
                </div>
            )}

            {!loading && !error && libraries.length === 0 && (
                <div className="muted text-sm">
                    No TV libraries found.
                </div>
            )}

            <ul className="space-y-2">
                {libraries.map((l) => (
                    <li
                        key={l.key}
                        className="row flex items-center justify-between"
                    >
                        <div>
                            <div className="font-medium">{l.title}</div>
                        </div>
                        <button
                            onClick={async () => {
                                await fetch('/api/libraries/select', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        key: l.key,
                                        title: l.title,
                                    }),
                                });
                                onSelect(l.title);
                            }}
                            className="btn btn-primary btn-sm"
                        >
                            Select
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
