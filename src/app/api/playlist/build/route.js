import { requireSession } from '@/lib/session';
import { getItemsMetadata } from '@/lib/plexClient';
import { setBaseline, scopedKey } from '@/lib/db';
import { ndjson } from '@/lib/stream';

export async function POST(req) {
    let body;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { title = 'Bingemix', episodeKeys = [] } = body;

    if (!Array.isArray(episodeKeys) || episodeKeys.length === 0) {
        return Response.json({ error: 'episodeKeys required' }, { status: 400 });
    }

    const { session, response } = await requireSession({ server: true });
    if (response) return response;
    const { uri, accessToken, machineId } = session.server;
    const accountId = session.accountId;

    // Plex needs several requests, so report each stage as it happens.
    return ndjson(async (send) => {
        send({ stage: 'creating' });

        const createUrl = new URL('/playlists', uri);
        createUrl.searchParams.set('type', 'video');
        createUrl.searchParams.set('title', title);
        createUrl.searchParams.set('smart', '0');
        createUrl.searchParams.set('X-Plex-Token', accessToken);
        createUrl.searchParams.append('uri', `/library/metadata/${episodeKeys[0]}`);

        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: { Accept: 'application/json' },
        });
        if (!createRes.ok) {
            throw new Error(`Plex could not create the playlist (${createRes.status})`);
        }
        const created = await createRes.json();
        const playlistKey = created?.MediaContainer?.Metadata?.[0]?.ratingKey;
        if (!playlistKey) throw new Error('Plex did not return a playlist');

        // The first episode was added at creation time.
        let added = 1;
        send({ stage: 'adding', done: added, total: episodeKeys.length });

        const chunkSize = 100;
        const chunkPrefix = `server://${machineId}/com.plexapp.plugins.library/library/metadata/`;
        // Start after the first episode, which creating the playlist already added.
        for (let i = 1; i < episodeKeys.length; i += chunkSize) {
            const chunk = episodeKeys.slice(i, i + chunkSize);
            const addUrl = new URL(`/playlists/${playlistKey}/items`, uri);
            addUrl.searchParams.set('uri', chunkPrefix + chunk.join(','));
            addUrl.searchParams.set('X-Plex-Token', accessToken);
            const addRes = await fetch(addUrl, {
                method: 'PUT',
                headers: { Accept: 'application/json' },
            });
            if (!addRes.ok) {
                throw new Error(`Plex could not add episodes (${addRes.status})`);
            }
            added += chunk.length;
            send({ stage: 'adding', done: added, total: episodeKeys.length });
        }

        send({ stage: 'finishing' });
        const metadata = await getItemsMetadata(
            { uri, accessToken, machineId },
            episodeKeys
        );
        const viewCountByKey = new Map(
            metadata.map((m) => [String(m.ratingKey), m.viewCount ?? 0])
        );
        for (const key of episodeKeys) {
            setBaseline(
                accountId,
                scopedKey(machineId, playlistKey),
                key,
                viewCountByKey.get(String(key)) ?? 0
            );
        }

        send({ stage: 'done', playlistKey, added });
    });
}
