import { cookies } from 'next/headers';
import { getItemsMetadata } from '@/lib/plexClient';
import { setBaseline } from '@/lib/db';

export async function POST(req) {
    try {
        const { title = 'Show Mixer', episodeKeys = [] } = await req.json();

        if (!Array.isArray(episodeKeys) || episodeKeys.length === 0) {
            return Response.json(
                { error: 'episodeKeys required' },
                { status: 400 }
            );
        }

        const cookieStore = await cookies();
        const raw = cookieStore.get('plex_server')?.value;
        if (!raw)
            return Response.json(
                { error: 'Not connected to Plex' },
                { status: 401 }
            );

        const { uri, accessToken, machineId } = JSON.parse(raw);

        const firstKey = episodeKeys[0];

        const createUrl = new URL('/playlists', uri);
        createUrl.searchParams.set('type', 'video');
        createUrl.searchParams.set('title', title);
        createUrl.searchParams.set('smart', '0');
        createUrl.searchParams.set('X-Plex-Token', accessToken);
        createUrl.searchParams.append('uri', `/library/metadata/${firstKey}`);

        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: { Accept: 'application/json' },
        });
        if (!createRes.ok) {
            const details = await createRes.text();
            return Response.json(
                { error: 'Failed to create playlist', details },
                { status: 502 }
            );
        }
        const created = await createRes.json();
        const playlistKey = created?.MediaContainer?.Metadata?.[0]?.ratingKey;
        if (!playlistKey) {
            return Response.json(
                { error: 'No playlist key returned' },
                { status: 502 }
            );
        }

        const chunkSize = 100;
        let added = 0;
        for (let i = 0; i < episodeKeys.length; i += chunkSize) {
            const chunkPrefix = `server://${machineId}/com.plexapp.plugins.library/library/metadata/`;
            const chunk = episodeKeys.slice(i, i + chunkSize).join(',');
            const addUrl = new URL(`/playlists/${playlistKey}/items`, uri);
            addUrl.searchParams.set('uri', chunkPrefix + chunk);
            addUrl.searchParams.set('X-Plex-Token', accessToken);
            const addRes = await fetch(addUrl, {
                method: 'PUT',
                headers: { Accept: 'application/json' },
            });
            if (!addRes.ok) {
                const details = await addRes.text();
                return Response.json(
                    { error: 'Failed to add items', details },
                    { status: 502 }
                );
            }
            added += Math.min(chunkSize, episodeKeys.length - i);
        }

        const metadata = await getItemsMetadata(
            { uri, accessToken, machineId },
            episodeKeys
        );
        const viewCountByKey = new Map(
            metadata.map((m) => [String(m.ratingKey), m.viewCount ?? 0])
        );
        for (const key of episodeKeys) {
            setBaseline(playlistKey, key, viewCountByKey.get(String(key)) ?? 0);
        }

        return Response.json(
            { ok: true, playlistKey, added },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('playlist build error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
