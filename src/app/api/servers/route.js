import { requireSession } from '@/lib/session';
import { getServerResources } from '@/lib/plexTv';

export async function GET() {
    try {
        const { session, response } = await requireSession();
        if (response) return response;

        let servers;
        try {
            servers = await getServerResources(session.token);
        } catch (err) {
            return Response.json(
                { error: 'Failed to fetch resources', details: err.message },
                { status: 502 }
            );
        }

        // Access tokens stay on the server; the browser only gets display info.
        const simplified = servers.map((s) => ({
            name: s.name,
            machineId: s.clientIdentifier,
            // Only summarise: raw addresses (often internal/Docker ones) stay server-side.
            hasLocal: (s.connections || []).some((c) => c.local),
            hasRemote: (s.connections || []).some((c) => !c.local),
        }));

        return Response.json(simplified, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('servers route error', error);
        return Response.json({ error: 'Unexpected error' }, { status: 500 });
    }
}
