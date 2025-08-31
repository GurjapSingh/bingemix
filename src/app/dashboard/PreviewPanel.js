'use client';

import { useState } from 'react';

export default function PreviewPanel({ selected }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState([]);

    async function handlePreview() {
        setLoading(true);
        setError('');
        setPreview([]);

        try {
            const results = await Promise.all(
                selected.map(async (show) => {
                    const res = await fetch(
                        `/api/shows/${show.ratingKey}/episodes`,
                        {
                            cache: 'no-store',
                        }
                    );
                    if (!res.ok)
                        throw new Error(
                            `Error fetching episodes for ${show.title}`
                        );
                    const data = await res.json();
                    return { ...show, episodes: data.episodes ?? [] };
                })
            );

            const allEpisodes = results.flatMap((s) =>
                (s.episodes || []).map((ep) => ({
                    ...ep,
                    showTitle: s.title,
                    showKey: s.ratingKey,
                }))
            );

            setPreview(allEpisodes);
        } catch (error) {
            setError(error.message || 'Error fetching episodes');
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="mt-8 space-y-3">
            <div className="flex items-center gap-2">
                <button
                    onClick={handlePreview}
                    disabled={loading || selected.length === 0}
                    className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
                >
                    {loading ? 'Loading…' : 'Preview all episodes'}
                </button>
                <span className="text-sm text-gray-600">
                    Shows selected: {selected.length}
                </span>
            </div>

            {error && (
                <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {!loading && !error && preview.length === 0 && (
                <div className="text-sm text-gray-500">
                    No episodes loaded yet.
                </div>
            )}

            {preview.length > 0 && (
                <>
                    <div className="text-sm text-gray-600">
                        Episodes loaded: {preview.length}
                    </div>
                    <ol className="list-decimal pl-6 space-y-1 max-h-[480px] overflow-auto border rounded p-3">
                        {preview.map((e) => (
                            <li
                                key={`${e.showKey}-${e.ratingKey}`}
                                className="text-sm"
                            >
                                <span className="font-medium">
                                    {e.showTitle}
                                </span>{' '}
                                · S{e.season}E{e.episode} — {e.title}
                            </li>
                        ))}
                    </ol>
                </>
            )}
        </section>
    );
}
