import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();
    const opts = {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    };

    cookieStore.set('plex_user_token', '', opts);
    cookieStore.set('plex_server', '', opts);
    cookieStore.set('plex_library', '', opts);

    return Response.json({ ok: true });
}
