import { requireSession } from '@/lib/session';
import { reconcileAccount } from '@/lib/reconcile';
import { readAccount } from '@/lib/stateStore';

export async function POST() {
    try {
        const { session, response } = await requireSession();
        if (response) return response;

        // Only this account's playlists; other accounts are untouched.
        try {
            await reconcileAccount(session.accountId);
        } catch (err) {
            // A 401 marks the account invalid; surfaced via authInvalid below.
            console.error('manual reconcile error', err.message);
        }
        const account = await readAccount(session.accountId);
        const machineId = session.server?.machineId;

        return Response.json({
            ok: true,
            playlists: account.playlists.filter(
                (p) => p.serverMachineId === machineId
            ),
            authInvalid: account.servers[machineId]?.invalid || false,
        });
    } catch (err) {
        console.error('manual reconcile error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
