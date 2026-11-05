import { requireSession } from '@/lib/session';
import { getPlaylistItems, removePlaylistItem, addItemsToPlaylist } from '@/lib/plexClient';
import { getSavepoint, deleteBaselinesForPlaylist, scopedKey } from '@/lib/db';

export async function POST(req, { params }) {
    try {
        const { playlistKey } = await params;
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const accountId = session.accountId;

        const dbKey = scopedKey(server.machineId, playlistKey);
        const savepoint = getSavepoint(accountId, dbKey);
        if (savepoint.length === 0) {
            return Response.json({ error: 'No save point exists for this playlist' }, { status: 404 });
        }

        // Remove all current items from the live playlist
        const current = await getPlaylistItems(server, playlistKey);
        for (const item of current) {
            await removePlaylistItem(server, playlistKey, item.playlistItemID);
        }

        // Clear baselines so reconcile re-seeds them on the next run
        deleteBaselinesForPlaylist(accountId, dbKey);

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
