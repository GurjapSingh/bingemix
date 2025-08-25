"use client";
import { useState, useEffect } from "react";

export default function ServersPanel() {
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchServers() {
            setLoading(true);
            setError("");
            try {
                const res = await fetch("/api/servers", { cache: "no-cache" });
                if (!res.ok) {
                    throw new Error("Failed to load servers.");
                }
                const data = await res.json();
                setServers(data);
            } catch (e) {
                setError(e.message || "Server Error");
            } finally {
                setLoading(false);
            }
        }
        fetchServers();
    },[]);
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
                    <li key={s.machineId} className="flex items-center justify-between rounded border p-3">
                        <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-gray-500">
                                Connections: {s.connections?.length ?? 0}
                            </div>
                        </div>
                        <button
                            className="px-3 py-1 rounded bg-black text-white"
                            onClick={() => {

                                alert(`Select ${s.name}`);
                            }}
                        >
                            Select
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}