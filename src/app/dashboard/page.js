import Header from './Header';
import ClientArea from './ClientArea';
import { getSession } from '@/lib/session';

export default async function DashboardPage() {
    const session = await getSession();
    const connected = !!session?.accountId;

    return (
        <main className="mx-auto max-w-4xl px-5 py-8">
            <Header profileTitle={session?.profileTitle ?? null} />

            {!connected && (
                <div className="alert alert-warn mb-5">
                    Not connected to Plex.{' '}
                    <a href="/setup" className="font-semibold underline">
                        Sign in
                    </a>
                </div>
            )}

            <ClientArea></ClientArea>
        </main>
    );
}
