"use client";
import { useState, useEffect } from "react";

export default function LibrariesPanel() {
    const [libraries, setLibraries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchLibraries() {
            try {
                const res = await fetch("/api/libraries", { cache: "no-store" });
                if (!res.ok) throw new Error("Failed to load libraries");

                const data = await res.json();
                // assuming you return { libraries: [...] } from the API
                setLibraries(data?.tvLibraries || []);
            } catch (e) {
                setError(e.message || "Libraries Error");
            } finally {
                setLoading(false);
            }
        }
        fetchLibraries();
    }, []);

    return (
        <section className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Your Plex Libraries</h2>

            {loading && <div className="text-gray-500">Loading libraries…</div>}
            {error && (
                <div className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {!loading && !error && libraries.length === 0 && (
                <div className="text-gray-500 text-sm">No TV libraries found.</div>
            )}

            <ul className="space-y-3">
                {libraries.map((l) => (
                    <li
                        key={l.key}
                        className="flex items-center justify-between rounded border p-3 hover:bg-gray-50"
                    >
                        <div>
                            <div className="font-medium">{l.title}</div>
                            <div className="text-xs text-gray-500">Key: {l.key}</div>
                        </div>
                        <button
                            onClick={async () => {
                                await fetch("/api/libraries/select", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ key: l.key, title: l.title }),
                                });
                                alert(`Selected ${l.title}`);
                            }}
                            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 transition"
                        >
                            Select
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}