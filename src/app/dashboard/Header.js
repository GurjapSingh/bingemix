'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfilePicker from '../ProfilePicker';
import ThemeToggle from '../ThemeToggle';

export default function Header({ profileTitle }) {
    const router = useRouter();
    const [profiles, setProfiles] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [switching, setSwitching] = useState(false);

    useEffect(() => {
        if (!profileTitle) return;
        fetch('/api/auth/profiles', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (!d) return;
                setProfiles(d.profiles);
                setActiveId(d.activeAccountId);
            })
            .catch(() => {});
    }, [profileTitle]);

    async function logout() {
        await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
        router.push('/setup');
    }

    return (
        <header className="mb-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] font-bold">
                        ▶
                    </div>
                    <h1 className="text-lg font-semibold tracking-tight">
                        Plex Show Mixer
                    </h1>
                </div>
                <div className="flex items-center gap-1">
                    <ThemeToggle variant="inline" />
                    {profileTitle && (
                        <>
                            <div className="mr-2 flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold uppercase">
                                    {profileTitle.charAt(0)}
                                </span>
                                <span className="hidden text-sm font-medium sm:inline">
                                    {profileTitle}
                                </span>
                            </div>
                            {profiles.length > 1 && (
                                <button
                                    onClick={() => setSwitching((v) => !v)}
                                    className="btn btn-ghost btn-sm"
                                >
                                    Switch profile
                                </button>
                            )}
                            <button
                                onClick={logout}
                                className="btn btn-ghost btn-sm"
                            >
                                Log out
                            </button>
                        </>
                    )}
                </div>
            </div>
            {switching && (
                <div className="card mt-4 max-w-sm">
                    <ProfilePicker
                        profiles={profiles}
                        activeAccountId={activeId}
                        onDone={() => window.location.reload()}
                    />
                </div>
            )}
        </header>
    );
}
