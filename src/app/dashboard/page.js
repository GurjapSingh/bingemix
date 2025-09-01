import { cookies } from 'next/headers';
import ServersPanel from './ServersPanel';
import LibrariesPanel from './LibrariesPanel';
import ClientArea from './ClientArea';
import LogoutPanel from './LogoutPanel';

export default async function DashboardPage() {
    const cookieStore = await cookies();
    const userToken = cookieStore.get('plex_user_token')?.value ?? null;
    const serverCookie = cookieStore.get('plex_server')?.value ?? null;
    const libraryCookie = cookieStore.get('plex_library')?.value ?? null;

    return (
        <main className="p-6">
            <div className="text-sm text-gray-700 mb-2">
                Welcome to the dashboard
            </div>

            {!userToken && (
                <div className="rounded bg-yellow-100 p-3 text-yellow-800">
                    Not connected to Plex.{' '}
                    <a href="/setup" className="underline">
                        Sign in
                    </a>
                </div>
            )}

            <ClientArea
                hasServer={serverCookie !== null}
                hasLibrary={libraryCookie !== null}
            ></ClientArea>
        </main>
    );
}
