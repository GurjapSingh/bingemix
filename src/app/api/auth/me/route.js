import { getSession } from '@/lib/session';

export async function GET() {
    const session = await getSession();
    if (!session) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return Response.json(
        {
            accountId: session.accountId,
            title: session.profileTitle,
            profileSelected: !!session.accountId,
        },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
