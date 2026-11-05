import { getSession } from '@/lib/session';
import { getHomeUsers } from '@/lib/plexTv';

export async function GET() {
    const session = await getSession();
    if (!session) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const profiles = await getHomeUsers(session.adminToken);
    return Response.json(
        { profiles, activeAccountId: session.accountId },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
