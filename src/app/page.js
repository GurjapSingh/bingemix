'use client';

import { useRouter } from 'next/navigation';

export default function WelcomePage() {
    const router = useRouter();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)] text-3xl text-[var(--accent-fg)] shadow-lg">
                ▶
            </div>
            <h1 className="mb-3 text-4xl font-bold tracking-tight">
                Plex Show Mixer
            </h1>
            <p className="mb-8 max-w-md text-lg muted">
                Build playlists that mix episodes from your favourite shows, and
                keep them fresh automatically.
            </p>
            <button
                onClick={() => router.push('/setup')}
                className="btn btn-primary px-6 py-3 text-base"
            >
                Get started
            </button>
        </div>
    );
}
