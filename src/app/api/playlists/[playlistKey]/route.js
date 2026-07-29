import { cookies } from 'next/headers';
import { deletePlaylist } from '@/lib/plexClient';
import { updateState } from '@/lib/stateStore';

async function getServer() {
    const cookieStore = await cookies();
    const raw = cookieStore.get('plex_server')?.value;
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function DELETE(req, { params }) {
    try {
        const { playlistKey } = await params;
        const server = await getServer();
        if (!server) {
            return Response.json(
                { error: 'Not connected to Plex' },
                { status: 401 }
            );
        }

        await deletePlaylist(server, playlistKey);

        await updateState((state) => ({
            ...state,
            playlists: state.playlists.filter(
                (p) => p.sourcePlaylistKey !== playlistKey
            ),
        }));

        return Response.json({ ok: true });
    } catch (err) {
        console.error('playlist delete error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
