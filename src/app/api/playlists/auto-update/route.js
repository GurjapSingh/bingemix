import { v4 as uuidv4 } from 'uuid';
import { requireSession } from '@/lib/session';
import { updateAccount, withServerAuth } from '@/lib/stateStore';
import { writeMarker } from '@/lib/marker';

export async function POST(req) {
    try {
        const { playlistKey, title, enabled } = await req.json();
        if (!playlistKey || !title) {
            return Response.json(
                { error: 'playlistKey and title required' },
                { status: 400 }
            );
        }

        const { session, response } = await requireSession({ server: true });
        if (response) return response;

        const now = new Date().toISOString();
        const machineId = session.server.machineId;
        // Plex playlist keys are only unique per server, so match on both.
        const isThis = (p) =>
            p.sourcePlaylistKey === playlistKey &&
            p.serverMachineId === machineId;

        await updateAccount(session.accountId, (account) => {
            const existing = account.playlists.find(isThis);

            const playlists = existing
                ? account.playlists.map((p) =>
                      isThis(p) ? { ...p, enabled: !!enabled, updatedAt: now } : p
                  )
                : [
                      ...account.playlists,
                      {
                          id: uuidv4(),
                          sourcePlaylistKey: playlistKey,
                          serverMachineId: machineId,
                          title,
                          enabled: !!enabled,
                          status: 'active',
                          lastPolledAt: null,
                          lastError: null,
                          createdAt: now,
                          updatedAt: now,
                      },
                  ];

            // Background polling uses this account's own credentials for this
            // server (encrypted at rest). Other servers' credentials are untouched.
            return enabled
                ? withServerAuth({ ...account, playlists }, machineId, {
                      plexUserToken: session.token,
                      server: session.server,
                  })
                : { ...account, playlists };
        });

        // Leave a note in Plex so other copies of the app can see this playlist
        // is already being handled. Best effort: never fail the toggle over it.
        try {
            await writeMarker(session.server, playlistKey, !!enabled);
            await updateAccount(session.accountId, (account) => ({
                ...account,
                playlists: account.playlists.map((p) =>
                    isThis(p)
                        ? { ...p, markerAt: enabled ? new Date().toISOString() : null }
                        : p
                ),
            }));
        } catch (markerErr) {
            console.warn('auto-update marker write failed:', markerErr.message);
        }

        return Response.json({ ok: true });
    } catch (err) {
        console.error('auto-update toggle error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
