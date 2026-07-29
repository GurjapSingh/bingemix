import Header from './Header';
import { cookies } from 'next/headers';
import ClientArea from './ClientArea';

export default async function DashboardPage() {
    const cookieStore = await cookies();
    const userToken = cookieStore.get('plex_user_token')?.value ?? null;

    return (
        <main className="mx-auto max-w-4xl p-6">
            <Header />

            {!userToken && (
                <div className="rounded bg-yellow-100 p-3 text-yellow-800">
                    Not connected to Plex.{' '}
                    <a href="/setup" className="underline">
                        Sign in
                    </a>
                </div>
            )}

            <ClientArea></ClientArea>
        </main>
    );
}
