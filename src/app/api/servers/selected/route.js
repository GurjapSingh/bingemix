import { cookies } from 'next/headers';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const cookieData = cookieStore.get('plex_server')?.value;

        if (!cookieData) {
            return Response.json(
                { error: 'No server selected' },
                { status: 404 }
            );
        }

        let server;
        try {
            server = JSON.parse(cookieData);
        } catch {
            cookieStore.set('plex_server', '', { maxAge: 0, path: '/' });
            return Response.json(
                { error: 'No server selected' },
                { status: 404 }
            );
        }

        if (!server?.machineId || !server?.uri) {
            return Response.json(
                { error: 'No server selected' },
                { status: 404 }
            );
        }

        return Response.json(
            { machineId: server.machineId, uri: server.uri },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Error while getting selected server', error);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
