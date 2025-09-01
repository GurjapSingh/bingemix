'use client';

import { useState } from 'react';
import SearchPanel from './SearchPanel';
import PreviewPanel from './PreviewPanel';
import ServersPanel from './ServersPanel';
import LibrariesPanel from './LibrariesPanel';

export default function ClientArea({ hasServer, hasLibrary }) {
    const [selected, setSelected] = useState([]);
    const [serverTitle, setServerTitle] = useState(null);
    const [libraryTitle, setLibrariesTitle] = useState(null);

    return (
        <section className="space-y-6">
            {/* 1. Check server cookie*/}
            <div
                className={`rounded border p-4 ${hasServer ? 'opacity-50' : ''}`}
            >
                <h2 className="font-semibold">Step 1: Choose a Plex server</h2>
                {serverTitle ? (
                    <p className="text-sm text-gray-600">
                        Selected server: {serverTitle}
                    </p>
                ) : (
                    <ServersPanel onSelect={setServerTitle} />
                )}
            </div>

            {/* 2. check for selected library*/}
            <div
                className={`rounded border p-4 ${hasLibrary ? 'opacity-50' : ''}`}
            >
                <h2 className="font-semibold">Step 2: Choose a Library</h2>
                {libraryTitle ? (
                    <p className="text-sm text-gray-600">
                        Selected library: {libraryTitle}
                    </p>
                ) : (
                    <LibrariesPanel onSelect={setLibrariesTitle} />
                )}
            </div>

            {/* 3. Search and preview */}
            {hasServer && hasLibrary && (
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
        </section>
    );
}
