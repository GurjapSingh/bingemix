import { cookies } from 'next/headers';

export async function GET(req) {
    try {
        const cookieStore = await cookies();
        const serverRaw = cookieStore.get('plex_server')?.value;
        const libRaw = cookieStore.get('plex_library')?.value;

        if (!serverRaw || !libRaw) {
            return Response.json(
                { error: 'Missing server or library' },
                { status: 401 }
            );
        }

        const server = JSON.parse(serverRaw);
        const lib = JSON.parse(libRaw);

        const q = req.nextUrl.searchParams.get('query') || '';
        if (!q.trim()) {
            return Response.json(
                { results: [] },
                { headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const url = new URL(`/library/sections/${lib.key}/all`, server.uri);
        url.searchParams.set('type', '2');
        url.searchParams.set('title', q);
        url.searchParams.set('X-Plex-Token', server.accessToken);

        const res = await fetch(url, {
            headers: { Accept: 'application/json', cache: 'no-store' },
        });
        if (!res.ok) {
            const body = await res.text();
            return Response.json(
                { error: 'Plex search failed', details: body },
                { status: 502 }
            );
        }

        const data = await res.json();
        const items = data?.MediaContainer?.Metadata ?? [];

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
