import { requireSession } from '@/lib/session';
import {
    getPlaylistItems,
    removePlaylistItem,
    movePlaylistItem,
} from '@/lib/plexClient';
import { deleteBaseline, scopedKey } from '@/lib/db';

function mapItem(item) {
    return {
        playlistItemID: String(item.playlistItemID),
        ratingKey: String(item.ratingKey),
        showRatingKey: item.grandparentRatingKey ? String(item.grandparentRatingKey) : null,
        showTitle: item.grandparentTitle || item.title,
        season: item.parentIndex,
        episode: item.index,
        title: item.title,
    };
}

export async function GET(req, { params }) {
    try {
        const { playlistKey } = await params;
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const accountId = session.accountId;

        const items = await getPlaylistItems(server, playlistKey);
        return Response.json(
            { items: items.map(mapItem) },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('playlist items list error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    try {
        const { playlistKey } = await params;
        const { order } = await req.json();

        if (!Array.isArray(order)) {
            return Response.json(
                { error: 'order (array of playlistItemID) required' },
                { status: 400 }
            );
        }

        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const accountId = session.accountId;

        const current = await getPlaylistItems(server, playlistKey);
        const desiredIds = order.map(String);
        const desiredSet = new Set(desiredIds);
        const currentById = new Map(
            current.map((i) => [String(i.playlistItemID), i])
        );

        const toRemove = current.filter(
            (i) => !desiredSet.has(String(i.playlistItemID))
        );
        for (const item of toRemove) {
            await removePlaylistItem(server, playlistKey, item.playlistItemID);
            deleteBaseline(accountId, scopedKey(server.machineId, playlistKey), item.ratingKey);
        }

        for (let i = 0; i < desiredIds.length; i++) {
            const itemId = desiredIds[i];
            if (!currentById.has(itemId)) continue; // ignore unknown/stale ids
            const afterId = i === 0 ? undefined : desiredIds[i - 1];
            await movePlaylistItem(server, playlistKey, itemId, afterId);
        }

        return Response.json(
            { ok: true },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('playlist items save error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
