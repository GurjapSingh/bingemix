import { requireSession } from '@/lib/session';

export async function GET() {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;

        const url = new URL('/library/sections', server.uri);
        url.searchParams.set('X-Plex-Token', server.accessToken);

        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
            const body = await res.text();
            return Response.json(
                { error: 'Plex PMS error', details: body },
                { status: 500 }
            );
        }

        const data = await res.json();
        const dirs = data?.MediaContainer?.Directory ?? [];

        const tvLibraries = dirs
            .filter((dir) => dir.type === 'show')
            .map((dir) => ({ key: String(dir.key), title: dir.title }));

        return Response.json(
            { tvLibraries },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('libraries route error', error);
        return Response.json(
            {
                error: 'Error while fetching libraries',
                details: String(error?.message || error),
            },
            { status: 500 }
        );
    }
}
