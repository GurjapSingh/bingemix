import { requireSession } from '@/lib/session';

export async function GET(req) {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const lib = session.library;

        const q = req.nextUrl.searchParams.get('query') || '';
        if (!q.trim()) {
            return Response.json(
                { results: [] },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        // With no library selected (e.g. while editing a playlist), search
        // every TV library on the server.
        let sectionKeys;
        if (lib) {
            sectionKeys = [lib.key];
        } else {
            const secUrl = new URL('/library/sections', server.uri);
            secUrl.searchParams.set('X-Plex-Token', server.accessToken);
            const secRes = await fetch(secUrl, {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            });
            if (!secRes.ok) {
                return Response.json(
                    { error: 'Plex search failed', details: await secRes.text() },
                    { status: 502 }
                );
            }
            const secData = await secRes.json();
            sectionKeys = (secData?.MediaContainer?.Directory ?? [])
                .filter((d) => d.type === 'show')
                .map((d) => String(d.key));
        }

        const seen = new Set();
        const items = [];
        for (const key of sectionKeys) {
            const url = new URL(`/library/sections/${key}/all`, server.uri);
            url.searchParams.set('type', '2');
            url.searchParams.set('title', q);
            url.searchParams.set('X-Plex-Token', server.accessToken);

            const res = await fetch(url, {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
            });
            if (!res.ok) {
                const body = await res.text();
                return Response.json(
                    { error: 'Plex search failed', details: body },
                    { status: 502 }
                );
            }
            const data = await res.json();
            for (const m of data?.MediaContainer?.Metadata ?? []) {
                if (seen.has(m.ratingKey)) continue;
                seen.add(m.ratingKey);
                items.push(m);
            }
        }

        const results = items.map((m) => ({
            ratingKey: String(m.ratingKey),
            title: m.title,
            year: m.year ?? null,
        }));

        return Response.json(
            { results },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('search route error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
