import { cookies } from 'next/headers';
import {
    deletePlaylist,
    getPlaylistItems,
    removePlaylistItem,
    addItemsToPlaylist,
    getItemsMetadata,
} from '@/lib/plexClient';
import { updateState } from '@/lib/stateStore';
import { deleteBaselinesForPlaylist, setBaseline } from '@/lib/db';

async function getServer() {
    const cookieStore = await cookies();
    const raw = cookieStore.get('plex_server')?.value;
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function PUT(req, { params }) {
    try {
        const { playlistKey } = await params;
        const { episodeKeys } = await req.json();

        if (!Array.isArray(episodeKeys) || episodeKeys.length === 0) {
            return Response.json({ error: 'episodeKeys required' }, { status: 400 });
        }

        const server = await getServer();
        if (!server) {
            return Response.json({ error: 'Not connected to Plex' }, { status: 401 });
        }

        const current = await getPlaylistItems(server, playlistKey);
        for (const item of current) {
            await removePlaylistItem(server, playlistKey, item.playlistItemID);
        }

        deleteBaselinesForPlaylist(playlistKey);
        await addItemsToPlaylist(server, playlistKey, episodeKeys);

        const metadata = await getItemsMetadata(server, episodeKeys);
        const viewCountByKey = new Map(
            metadata.map((m) => [String(m.ratingKey), m.viewCount ?? 0])
        );
        for (const key of episodeKeys) {
            setBaseline(playlistKey, key, viewCountByKey.get(String(key)) ?? 0);
        }

        return Response.json({ ok: true, count: episodeKeys.length });
    } catch (err) {
        console.error('playlist update error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
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
