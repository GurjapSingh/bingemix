'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * variant="floating": fixed top-right (hidden on /dashboard, where the header
 * renders its own inline toggle). variant="inline": sits in a toolbar.
 */
export default function ThemeToggle({ variant = 'floating' }) {
    const [theme, setTheme] = useState(null);
    const pathname = usePathname();

    useEffect(() => {
        setTheme(document.documentElement.dataset.theme || 'light');
    }, []);

    function toggle() {
        const next = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem('theme', next);
        } catch {}
        setTheme(next);
    }

    // Render nothing until we know the theme, to avoid a wrong-icon flash.
    if (!theme) return null;
    if (variant === 'floating' && pathname?.startsWith('/dashboard')) return null;

    return (
        <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className={
                variant === 'floating'
                    ? 'fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-lg shadow-lg transition hover:scale-105'
                    : 'btn btn-ghost btn-sm text-base'
            }
        >
            {theme === 'dark' ? '☀️' : '🌙'}
        </button>
    );
}
