import { cookies } from 'next/headers';
import { updateState } from '@/lib/stateStore';

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('plex_user_token')?.value;
        const rawServer = cookieStore.get('plex_server')?.value;
        if (!token || !rawServer) {
            return Response.json(
                { error: 'Not connected to Plex' },
                { status: 401 }
            );
        }

        const now = new Date().toISOString();

        await updateState((state) => ({
            ...state,
            auth: {
                plexUserToken: token,
                server: JSON.parse(rawServer),
                invalid: false,
                invalidReason: null,
                savedAt: now,
            },
        }));

        return Response.json({ ok: true });
    } catch (err) {
        console.error('reauth error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
