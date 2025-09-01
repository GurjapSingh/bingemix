'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
    const [pin, setPin] = useState(null);
    const router = useRouter();

    async function handleClick() {
        try {
            const res = await fetch('/api/auth/pin/start', {
                method: 'POST',
            });
            if (!res.ok) return alert('Could not get PIN');
            const data = await res.json();
            setPin(data);
        } catch (err) {
            console.error(err);
            alert('something went wrong');
        }
    }

    return (
        <>
            <div className="flex flex-col items-center justify-center h-screen text-center gap-3">
                <button
                    onClick={handleClick}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition"
                >
                    Sign in with Plex
                </button>

                {pin && (
                    <>
                        <div className="text-sm text-gray-700">
                            Go to <b>plex.tv/link</b> and enter code:
                            <div className="text-2xl font-bold tracking-widest mt-1">
                                {pin.code}
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                const r = await fetch(
                                    `/api/auth/pin/poll?pinId=${pin.id}`
                                );
                                if (!r.ok) return alert('Check Failed');
                                const d = await r.json();
                                if (d.ok) {
                                    router.push('/dashboard');
                                } else {
                                    alert(
                                        'Not linked yet. Please enter the code and complete linking.'
                                    );
                                }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                        >
                            Check Status
                        </button>
                    </>
                )}
            </div>
        </>
    );
}
