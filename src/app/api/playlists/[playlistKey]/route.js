import { requireSession } from '@/lib/session';
import {
    deletePlaylist,
    getPlaylistItems,
    removePlaylistItem,
    addItemsToPlaylist,
    getItemsMetadata,
} from '@/lib/plexClient';
import { updateAccount } from '@/lib/stateStore';
import { ndjson } from '@/lib/stream';
import {
    deleteBaselinesForPlaylist,
    setBaseline,
    clearSavepoint,
    scopedKey,
} from '@/lib/db';

export async function PUT(req, { params }) {
    const { playlistKey } = await params;
    let body;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { episodeKeys } = body;

    if (!Array.isArray(episodeKeys) || episodeKeys.length === 0) {
        return Response.json({ error: 'episodeKeys required' }, { status: 400 });
    }

    const { session, response } = await requireSession({ server: true });
    if (response) return response;
    const server = session.server;
    const accountId = session.accountId;
    const dbKey = scopedKey(server.machineId, playlistKey);

    // Many Plex requests: stream progress so the page can show it.
    return ndjson(async (send) => {
        const current = await getPlaylistItems(server, playlistKey);
        for (let i = 0; i < current.length; i++) {
            send({ stage: 'removing', done: i, total: current.length });
            await removePlaylistItem(server, playlistKey, current[i].playlistItemID);
        }

        deleteBaselinesForPlaylist(accountId, dbKey);
        send({ stage: 'adding' });
        await addItemsToPlaylist(server, playlistKey, episodeKeys);

        send({ stage: 'finishing' });
        const metadata = await getItemsMetadata(server, episodeKeys);
        const viewCountByKey = new Map(
            metadata.map((m) => [String(m.ratingKey), m.viewCount ?? 0])
        );
        for (const key of episodeKeys) {
            setBaseline(accountId, dbKey, key, viewCountByKey.get(String(key)) ?? 0);
        }

        send({ stage: 'done', count: episodeKeys.length });
    });
}

export async function DELETE(req, { params }) {
    try {
        const { playlistKey } = await params;
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const accountId = session.accountId;

        await deletePlaylist(server, playlistKey);

        const dbKey = scopedKey(server.machineId, playlistKey);
        deleteBaselinesForPlaylist(accountId, dbKey);
        clearSavepoint(accountId, dbKey);
        await updateAccount(accountId, (account) => ({
            ...account,
            playlists: account.playlists.filter(
                (p) =>
                    !(
                        p.sourcePlaylistKey === playlistKey &&
                        p.serverMachineId === server.machineId
                    )
            ),
        }));

        return Response.json({ ok: true });
    } catch (err) {
        console.error('playlist delete error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
