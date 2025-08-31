import { cookies } from 'next/headers';

export async function POST(req) {
    try {
        const body = await req.json();
        const { key, title } = body;

        const cookieStore = await cookies();
        cookieStore.set('plex_library', JSON.stringify({ key, title }), {
            httpOnly: true,
            sameSite: 'no-cache',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
        });
        return Response.json({ ok: true });
    } catch (e) {
        console.error('Error selecting library', e);
        return Response.json({ error: 'Library error' }, { status: 500 });
    }
}
