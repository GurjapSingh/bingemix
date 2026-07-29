import { cookies } from 'next/headers';
import { listPlaylists } from '@/lib/plexClient';
import { readState } from '@/lib/stateStore';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const raw = cookieStore.get('plex_server')?.value;
        if (!raw) {
            return Response.json(
                { error: 'Not connected to Plex' },
                { status: 401 }
            );
        }
        const server = JSON.parse(raw);

        const [playlists, state] = await Promise.all([
            listPlaylists(server),
            readState(),
        ]);

        const byKey = new Map(
            state.playlists.map((p) => [p.sourcePlaylistKey, p])
        );

        const result = playlists
            .filter((p) => !p.title?.endsWith('_watched'))
            .map((p) => {
                const entry = byKey.get(p.ratingKey);
                return {
                    playlistKey: p.ratingKey,
                    title: p.title,
                    autoUpdateEnabled: entry?.enabled || false,
                    watchedPlaylistTitle: entry?.watchedPlaylistTitle || null,
                    status: entry?.status || null,
                    lastPolledAt: entry?.lastPolledAt || null,
                    lastError: entry?.lastError || null,
                };
            });

        return Response.json({
            playlists: result,
            authInvalid: state.auth?.invalid || false,
        });
    } catch (err) {
        console.error('playlists list error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
