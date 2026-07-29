import { cookies } from 'next/headers';
import { reconcileAll } from '@/lib/reconcile';
import { readState } from '@/lib/stateStore';

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('plex_user_token')?.value;
        if (!token) {
            return Response.json(
                { error: 'Not authenticated' },
                { status: 401 }
            );
        }

        await reconcileAll();
        const state = await readState();

        return Response.json({
            ok: true,
            playlists: state.playlists,
            authInvalid: state.auth?.invalid || false,
        });
    } catch (err) {
        console.error('manual reconcile error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
