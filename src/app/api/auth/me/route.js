import { getSession } from '@/lib/session';
import { ourInstance } from '@/lib/marker';

export async function GET() {
    const session = await getSession();
    if (!session) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const instance = await ourInstance();
    return Response.json(
        {
            instance: { host: instance.host, id: instance.id },
            accountId: session.accountId,
            title: session.profileTitle,
            profileSelected: !!session.accountId,
        },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
