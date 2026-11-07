'use client';

import { useRouter } from 'next/navigation';
import Logo from './Logo';

export default function WelcomePage() {
    const router = useRouter();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
            <Logo className="mb-6 h-16 w-16 rounded-2xl shadow-lg" title="Bingemix" />
            <h1 className="mb-3 text-4xl font-bold tracking-tight">
                Bingemix{' '}
                <span className="text-xl font-medium muted">for Plex</span>
            </h1>
            <p className="mb-8 max-w-md text-lg muted">
                Interleave or shuffle your favourite shows into one auto-updating
                playlist.
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
