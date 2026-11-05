import { requireSession } from '@/lib/session';

export async function GET(req, { params }) {
    const { ratingKey } = await params;
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;

        const url = new URL(
            `/library/metadata/${ratingKey}/allLeaves`,
            server.uri
        );
        url.searchParams.set('X-Plex-Token', server.accessToken);

        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) {
            const body = await res.text();
            return Response.json(
                { error: 'Episodes search failed', details: body },
                { status: 502 }
            );
        }

        const data = await res.json();
        const episodes = (data?.MediaContainer?.Metadata ?? [])
            .filter((i) => i.type === 'episode' || i.type === 4)
            .map((i) => ({
                ratingKey: i.ratingKey,
                season: i.parentIndex,
                episode: i.index,
                title: i.title,
                airDate: i.originallyAvailableAt ?? null,
                durationMs: i.duration ?? null,
                // Plex's audience score when present, else the critic score (0-10).
                rating: i.audienceRating ?? i.rating ?? null,
                // Per-account: reflects the logged-in profile's watch history.
                watched: (i.viewCount ?? 0) > 0,
            }))
            .filter((ep) => Number(ep.season) > 0);

        return Response.json(
            { episodes },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (err) {
        console.error('search route error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
