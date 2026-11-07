'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfilePicker from '../ProfilePicker';
import Logo from '../Logo';

function Step({ n, title, children }) {
    return (
        <li className="flex items-start gap-3 text-left">
            <span className="step-badge">
                Step {n}
            </span>
            <div className="flex flex-col items-start gap-2 pt-0.5">
                <div className="font-medium">{title}</div>
                {children}
            </div>
        </li>
    );
}

export default function SetupPage() {
    const [pin, setPin] = useState(null);
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);
    const [checking, setChecking] = useState(false);
    const [notLinked, setNotLinked] = useState(false);
    const [profiles, setProfiles] = useState(null);
    const router = useRouter();

    async function handleClick() {
        try {
            const res = await fetch('/api/auth/pin/start', {
                method: 'POST',
            });
            if (!res.ok) return alert('Could not get PIN');
            const data = await res.json();
            setPin(data);
            setCopied(false);
            setCopyFailed(false);
            setNotLinked(false);
        } catch (err) {
            console.error(err);
            alert('something went wrong');
        }
    }

    // The modern clipboard API only works on https:// or localhost. This app is
    // often opened over plain http on a home network, so fall back to the older
    // copy command, which works anywhere.
    function legacyCopy(text) {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        document.body.removeChild(el);
        return ok;
    }

    async function copyCode() {
        let ok = false;
        if (window.isSecureContext && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(pin.code);
                ok = true;
            } catch {
                ok = false;
            }
        }
        if (!ok) ok = legacyCopy(pin.code);

        setCopyFailed(!ok);
        setCopied(ok);
        if (ok) setTimeout(() => setCopied(false), 2000);
    }

    async function checkLinked() {
        setChecking(true);
        setNotLinked(false);
        try {
            const r = await fetch(`/api/auth/pin/poll?pinId=${pin.id}`);
            if (!r.ok) return alert('Check Failed');
            const d = await r.json();
            if (d.ok && d.needsProfile) {
                setProfiles(d.profiles);
            } else if (d.ok) {
                router.push('/dashboard');
            } else {
                setNotLinked(true);
            }
        } catch (err) {
            console.error(err);
            alert('something went wrong');
        } finally {
            setChecking(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
            <Logo className="h-14 w-14 rounded-2xl shadow-lg" title="Bingemix" />
            {profiles ? (
                <>
                    <h1 className="text-2xl font-bold tracking-tight">Who&apos;s watching?</h1>
                    <div className="card w-full max-w-sm">
                        <ProfilePicker
                            profiles={profiles}
                            activeAccountId={null}
                            onDone={() => router.push('/dashboard')}
                        />
                    </div>
                </>
            ) : !pin ? (
                <>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Bingemix{' '}
                            <span className="text-lg font-medium muted">for Plex</span>
                        </h1>
                        <p className="mt-2 muted">
                            Connect your Plex account to get started.
                        </p>
                    </div>
                    <button
                        onClick={handleClick}
                        className="btn btn-primary px-6 py-3 text-base"
                    >
                        Sign in with Plex
                    </button>
                </>
            ) : (
                <>
                    <h1 className="text-2xl font-bold tracking-tight">Link your Plex account</h1>
                    <ol className="card flex w-full max-w-sm flex-col gap-6">
                        <Step n={1} title="Copy your code">
                            <div className="flex items-center gap-3">
                                <span className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 font-mono text-2xl font-bold tracking-widest">
                                    {pin.code}
                                </span>
                                <button
                                    onClick={copyCode}
                                    className="btn btn-secondary btn-sm"
                                >
                                    {copied ? 'Copied!' : 'Copy code'}
                                </button>
                            </div>
                            {copyFailed && (
                                <p className="text-xs muted">
                                    Couldn&apos;t copy automatically. Select the
                                    code and press Ctrl/Cmd+C.
                                </p>
                            )}
                        </Step>
                        <Step n={2} title="Enter it on Plex">
                            <a
                                href="https://plex.tv/link"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary btn-sm"
                            >
                                Open plex.tv/link ↗
                            </a>
                        </Step>
                        <Step n={3} title="Come back and continue">
                            <button
                                onClick={checkLinked}
                                disabled={checking}
                                className="btn btn-primary"
                            >
                                {checking ? 'Checking…' : "I've entered the code"}
                            </button>
                            {notLinked && (
                                <p className="text-sm text-red-500">
                                    Not linked yet. Enter the code on Plex,
                                    then try again.
                                </p>
                            )}
                        </Step>
                    </ol>
                    <button
                        onClick={handleClick}
                        className="btn btn-ghost btn-sm"
                    >
                        Get a new code
                    </button>
                </>
            )}
        </div>
    );
}
