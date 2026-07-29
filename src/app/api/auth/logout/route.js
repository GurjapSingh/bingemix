import { cookies } from 'next/headers';
import { updateState } from '@/lib/stateStore';

export async function POST(req) {
    const cookieStore = await cookies();
    const opts = {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 0,
    };

    cookieStore.set('plex_user_token', '', opts);
    cookieStore.set('plex_server', '', opts);
    cookieStore.set('plex_library', '', opts);

    await updateState((state) => ({
        ...state,
        auth: null,
        playlists: state.playlists.map((p) => ({ ...p, enabled: false })),
    }));

    return Response.json({ ok: true });
}
