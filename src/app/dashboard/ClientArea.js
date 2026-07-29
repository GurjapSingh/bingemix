'use client';

import { useState } from 'react';
import SearchPanel from './SearchPanel';
import PreviewPanel from './PreviewPanel';
import ServersPanel from './ServersPanel';
import LibrariesPanel from './LibrariesPanel';
import PlaylistsPanel from './PlaylistsPanel';
import { useRouter } from 'next/navigation';

export default function ClientArea() {
    const router = useRouter();
    const [selected, setSelected] = useState([]);
    const [serverTitle, setServerTitle] = useState(null);
    const [libraryTitle, setLibraryTitle] = useState(null);

    async function doLibraryChange() {
        await fetch('/api/libraries/clear', {
            method: 'POST',
            cache: 'no-store',
        });
        setLibraryTitle(null);
        setSelected([]);
        router.refresh();
    }

    async function doServerChange() {
        await fetch('/api/libraries/clear', {
            method: 'POST',
            cache: 'no-store',
        });
        await fetch('/api/servers/clear', {
            method: 'POST',
            cache: 'no-store',
        });
        setSelected([]);
        setLibraryTitle(null);
        setServerTitle(null);
        router.refresh();
    }

    return (
        <section className="space-y-6">
            {/* 1. Check server cookie*/}
            <div className="rounded border p-4">
                <h2 className="font-semibold">Step 1: Choose a Plex server</h2>
                {serverTitle ? (
                    <>
                        <p className="text-sm text-gray-600">
                            Selected server: {serverTitle}
                        </p>
                        <button
                            onClick={doServerChange}
                            className="rounded bg-gray-200 px-3 py-1"
                        >
                            Change Server
                        </button>
                    </>
                ) : (
                    <ServersPanel onSelect={setServerTitle} />
                )}
            </div>

            {/* 2. check for selected library*/}
            {serverTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">Step 2: Choose a Library</h2>
                    {libraryTitle ? (
                        <>
                            <p className="text-sm text-gray-600">
                                Selected library: {libraryTitle}
                            </p>
                            <button
                                onClick={doLibraryChange}
                                className="rounded bg-gray-200 px-3 py-1"
                            >
                                Change Library
                            </button>
                        </>
                    ) : (
                        <LibrariesPanel onSelect={setLibraryTitle} />
                    )}
                </div>
            )}

            {/* 3. Search and preview */}
            {serverTitle && libraryTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">
                        Step 3: Search and select shows
                    </h2>
                    <SearchPanel
                        selected={selected}
                        onChangeSelected={setSelected}
                    />
                    <PreviewPanel selected={selected} />
                </div>
            )}

            {/* 4. Manage auto-update playlists */}
            {serverTitle && (
                <div className="rounded border p-4">
                    <h2 className="font-semibold">
                        Manage Auto-Update Playlists
                    </h2>
                    <PlaylistsPanel />
                </div>
            )}
        </section>
    );
}
