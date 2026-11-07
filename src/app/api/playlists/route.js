import { requireSession } from '@/lib/session';
import { listPlaylists } from '@/lib/plexClient';
import { readAccount } from '@/lib/stateStore';
import { parseMarker, isStale, ourInstance } from '@/lib/marker';

export async function GET() {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;
        const server = session.server;
        const accountId = session.accountId;

        const [playlists, account] = await Promise.all([
            listPlaylists(server),
            readAccount(accountId),
        ]);

        // Only this server's entries: playlist keys repeat across servers.
        const byKey = new Map(
            account.playlists
                .filter((p) => p.serverMachineId === server.machineId)
                .map((p) => [p.sourcePlaylistKey, p])
        );

        const me = await ourInstance();

        const result = playlists
            .filter((p) => !p.title?.endsWith('_watched'))
            .map((p) => {
                const entry = byKey.get(p.ratingKey);
                // Is a different copy of Bingemix already updating this playlist?
                const marker = parseMarker(p.summary);
                const external =
                    marker && marker.instanceId !== me.id
                        ? {
                              host: marker.host,
                              instanceId: marker.instanceId,
                              lastChecked: marker.lastChecked,
                              stale: isStale(marker),
                          }
                        : null;
                return {
                    externalAutoUpdate: external,
                    playlistKey: p.ratingKey,
                    title: p.title,
                    autoUpdateEnabled: entry?.enabled || false,
                    watchedPlaylistTitle: entry?.watchedPlaylistTitle || null,
                    status: entry?.status || null,
                    lastPolledAt: entry?.lastPolledAt || null,
                    lastError: entry?.lastError || null,
                };
            });

        return Response.json({
            playlists: result,
            authInvalid: account.servers[server.machineId]?.invalid || false,
        });
    } catch (err) {
        console.error('playlists list error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
