import { cookies } from "next/headers";
import ServersPanel from "./ServersPanel";
import LibrariesPanel from "./LibrariesPanel";
import SearchPanel from "./SearchPanel";

export default async function DashboardPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("plex_user_token")?.value;

    return (
        <main className="p-6">
            <div className="text-sm text-gray-700 mb-2">Welcome to the dashboard</div>

            {token ? (
                <div className="inline-flex items-center gap-2 rounded bg-green-100 px-3 py-1 text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-600"/>
                    Connected to Plex
                </div>
            ) : (
                <div className="inline-flex items-center gap-2 rounded bg-red-100 px-3 py-1 text-red-700">
                    <span className="h-2 w-2 rounded-full bg-red-600"/>
                    Not connected (no plex_user_token)
                </div>
            )}
            <ServersPanel></ServersPanel>
            <LibrariesPanel></LibrariesPanel>
            <SearchPanel></SearchPanel>
        </main>
    );
}