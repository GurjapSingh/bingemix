import { cookies } from 'next/headers';

export async function POST(req) {
    try {
        const body = await req.json();
        const { machineId, accessToken, uri } = body;

        if (!machineId || !accessToken || !uri) {
            return Response.json(
                { error: 'Machine id mismatch' },
                { status: 400 }
            );
        }
        const cookieStore = await cookies();
        cookieStore.set(
            'plex_server',
            JSON.stringify({ machineId, accessToken, uri }),
            {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
            }
        );
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error selecting server', error);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
