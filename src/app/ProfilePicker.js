'use client';
import { useState } from 'react';

/** Lets the user choose which Plex Home profile to use. */
export default function ProfilePicker({ profiles, activeAccountId, onDone }) {
    const [pinFor, setPinFor] = useState(null);
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function choose(profile, pinValue) {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/auth/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: profile.uuid, pin: pinValue }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Could not switch');
            onDone();
        } catch (e) {
            setError(e.message || 'Could not switch');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-3 w-full max-w-sm">
            <ul className="flex flex-col gap-2">
                {profiles.map((p) => (
                    <li key={p.uuid}>
                        <button
                            disabled={busy}
                            onClick={() =>
                                p.protected
                                    ? (setPinFor(p.uuid), setPin(''), setError(''))
                                    : choose(p, undefined)
                            }
                            className="row w-full flex items-center justify-between disabled:opacity-60"
                        >
                            <span className="font-medium">{p.title}</span>
                            <span className="text-xs muted">
                                {p.uuid && activeAccountId && p.id === activeAccountId
                                    ? 'current'
                                    : p.protected
                                      ? 'PIN'
                                      : ''}
                            </span>
                        </button>
                        {pinFor === p.uuid && (
                            <form
                                className="mt-2 flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    choose(p, pin);
                                }}
                            >
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    autoFocus
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="Profile PIN"
                                    className="flex-1 input"
                                />
                                <button
                                    disabled={busy || !pin}
                                    className="btn btn-primary"
                                >
                                    Go
                                </button>
                            </form>
                        )}
                    </li>
                ))}
            </ul>
            {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
    );
}
