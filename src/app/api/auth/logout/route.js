import { getSession, destroySession } from '@/lib/session';
import { updateAccount, readAccount } from '@/lib/stateStore';
import { writeMarker } from '@/lib/marker';

export async function POST() {
    const session = await getSession();

    if (session?.accountId) {
        // Logging out turns auto-update off, so remove our notes from Plex too.
        if (session.server) {
            const account = await readAccount(session.accountId);
            for (const p of account.playlists) {
                if (p.enabled && p.serverMachineId === session.server.machineId) {
                    await writeMarker(session.server, p.sourcePlaylistKey, false).catch(() => {});
                }
            }
        }
        await updateAccount(session.accountId, (account) => ({
            ...account,
            servers: {},
            playlists: account.playlists.map((p) => ({ ...p, enabled: false })),
        }));
    }
    await destroySession();

    return Response.json({ ok: true });
}
