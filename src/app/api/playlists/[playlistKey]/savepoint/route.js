import { cookies } from 'next/headers';
import { getPlaylistItems } from '@/lib/plexClient';
import { saveSavepoint, getSavepoint, clearSavepoint } from '@/lib/db';

async function getServer() {
    const cookieStore = await cookies();
    const raw = cookieStore.get('plex_server')?.value;
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function GET(req, { params }) {
    try {
        const { playlistKey } = await params;
        const rows = getSavepoint(playlistKey);
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
        const server = await getServer();
        if (!server) {
            return Response.json({ error: 'Not connected to Plex' }, { status: 401 });
        }

        const plexItems = await getPlaylistItems(server, playlistKey);
        const items = plexItems.map((item) => ({
            ratingKey: String(item.ratingKey),
            showTitle: item.grandparentTitle || item.title,
            season: item.parentIndex ?? null,
            episode: item.index ?? null,
            title: item.title,
        }));

        saveSavepoint(playlistKey, items);

        return Response.json({ ok: true, count: items.length });
    } catch (err) {
        console.error('savepoint save error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { playlistKey } = await params;
        clearSavepoint(playlistKey);
        return Response.json({ ok: true });
    } catch (err) {
        console.error('savepoint delete error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
