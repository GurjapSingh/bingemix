"use client";
import { useState, useEffect } from "react";

export default function LibrariesPanel() {
    const [libraries, setLibraries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function fetchLibraries() {
            try {
                const res = await fetch("/api/libraries", { cache: "no-cache" });
                if (!res.ok) {
                    throw new Error("Failed to load libraries");
                }
                const data = await res.json();
                console.log("Libraries", data.tvLibraries);
                setLibraries(data?.tvLibraries);
            } catch (e) {
                setError(e.message || "Libraries Error");
            } finally {
                setLoading(false);
            }
        }
        fetchLibraries();
    },[]);

    return (
        <section>
            <h2 className="font-semibold">Your Plex Libraries</h2>
            <ul>
                {libraries.map((l) => (
                    <li key={l.title}>
                        <h2>{l.title}</h2>
                        <button
                            onClick={ async () => {
                                await fetch("/api/libraries/select", {
                                    method: "POST",
                                    headers: {content:"application/json"},
                                    body: JSON.stringify({key: l.key, title: l.title}),
                                });

                                alert("clicked select");
                            }}
                        >
                            select
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}