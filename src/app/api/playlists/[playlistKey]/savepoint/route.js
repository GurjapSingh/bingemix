import { requireSession } from '@/lib/session';
import { getPlaylistItems } from '@/lib/plexClient';
import { saveSavepoint, getSavepoint, clearSavepoint, scopedKey } from '@/lib/db';

export async function GET(req, { params }) {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const { playlistKey } = await params;
        const rows = getSavepoint(
            session.accountId,
            scopedKey(session.server.machineId, playlistKey)
        );
        if (rows.length === 0) {
            return Response.json({ savepoint: null });
        }
        return Response.json({
            savepoint: {
                savedAt: rows[0].saved_at,
                count: rows.length,
                items: rows.map((r) => ({
                    ratingKey: r.rating_key,
                    showTitle: r.show_title,
                    season: r.season,
                    episode: r.episode,
                    title: r.title,
                })),
            },
        });
    } catch (err) {
        console.error('savepoint get error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function POST(req, { params }) {
    try {
        const { playlistKey } = await params;
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const accountId = session.accountId;

        const plexItems = await getPlaylistItems(server, playlistKey);
        const items = plexItems.map((item) => ({
            ratingKey: String(item.ratingKey),
            showTitle: item.grandparentTitle || item.title,
            season: item.parentIndex ?? null,
            episode: item.index ?? null,
            title: item.title,
        }));

        saveSavepoint(accountId, scopedKey(server.machineId, playlistKey), items);

        return Response.json({ ok: true, count: items.length });
    } catch (err) {
        console.error('savepoint save error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const { playlistKey } = await params;
        clearSavepoint(
            session.accountId,
            scopedKey(session.server.machineId, playlistKey)
        );
        return Response.json({ ok: true });
    } catch (err) {
        console.error('savepoint delete error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
