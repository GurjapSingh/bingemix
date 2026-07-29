import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { updateState } from '@/lib/stateStore';

export async function POST(req) {
    try {
        const { playlistKey, title, enabled } = await req.json();
        if (!playlistKey || !title) {
            return Response.json(
                { error: 'playlistKey and title required' },
                { status: 400 }
            );
        }

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

        await updateState((state) => {
            const existing = state.playlists.find(
                (p) => p.sourcePlaylistKey === playlistKey
            );

            const playlists = existing
                ? state.playlists.map((p) =>
                      p.sourcePlaylistKey === playlistKey
                          ? { ...p, enabled: !!enabled, updatedAt: now }
                          : p
                  )
                : [
                      ...state.playlists,
                      {
                          id: uuidv4(),
                          sourcePlaylistKey: playlistKey,
                          title,
                          enabled: !!enabled,
                          status: 'active',
                          lastPolledAt: null,
                          lastError: null,
                          createdAt: now,
                          updatedAt: now,
                      },
                  ];

            return {
                ...state,
                auth: enabled
                    ? {
                          plexUserToken: token,
                          server: JSON.parse(rawServer),
                          invalid: false,
                          invalidReason: null,
                          savedAt: now,
                      }
                    : state.auth,
                playlists,
            };
        });

        return Response.json({ ok: true });
    } catch (err) {
        console.error('auto-update toggle error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
