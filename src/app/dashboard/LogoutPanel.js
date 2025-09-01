'use client';
import { useRouter } from 'next/navigation';

export default function LogoutPanel() {
    const router = useRouter();
    return (
        <section>
            <button
                onClick={async () => {
                    await fetch('/api/auth/logout', {
                        method: 'post',
                        cache: 'no-store',
                    });
                    router.push('/setup');
                }}
                className="bg-amber-100"
            >
                logout
            </button>
        </section>
    );
}
