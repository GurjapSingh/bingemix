import { requireSession } from '@/lib/session';

export async function GET() {
    const { session, response } = await requireSession();
    if (response) return response;

    if (!session.server) {
        return Response.json({ error: 'No server selected' }, { status: 404 });
    }
    return Response.json(
        { machineId: session.server.machineId, uri: session.server.uri },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
