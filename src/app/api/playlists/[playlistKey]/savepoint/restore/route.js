import { cookies } from 'next/headers';
import { getPlaylistItems, removePlaylistItem, addItemsToPlaylist } from '@/lib/plexClient';
import { getSavepoint, deleteBaselinesForPlaylist } from '@/lib/db';

async function getServer() {
    const cookieStore = await cookies();
    const raw = cookieStore.get('plex_server')?.value;
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function POST(req, { params }) {
    try {
        const { playlistKey } = await params;
        const server = await getServer();
        if (!server) {
            return Response.json({ error: 'Not connected to Plex' }, { status: 401 });
        }

        const savepoint = getSavepoint(playlistKey);
        if (savepoint.length === 0) {
            return Response.json({ error: 'No save point exists for this playlist' }, { status: 404 });
        }

        // Remove all current items from the live playlist
        const current = await getPlaylistItems(server, playlistKey);
        for (const item of current) {
            await removePlaylistItem(server, playlistKey, item.playlistItemID);
        }

        // Clear baselines so reconcile re-seeds them on the next run
        deleteBaselinesForPlaylist(playlistKey);

        // Re-add savepoint items in saved order
        const ratingKeys = savepoint.map((r) => r.rating_key);
        if (ratingKeys.length > 0) {
            await addItemsToPlaylist(server, playlistKey, ratingKeys);
        }

        return Response.json({ ok: true, count: ratingKeys.length });
    } catch (err) {
        console.error('savepoint restore error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
