import { requireSession } from '@/lib/session';
import { updateAccount, withServerAuth } from '@/lib/stateStore';

export async function POST() {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;

        await updateAccount(session.accountId, (account) =>
            withServerAuth(account, session.server.machineId, {
                plexUserToken: session.token,
                server: session.server,
            })
        );

        return Response.json({ ok: true });
    } catch (err) {
        console.error('reauth error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
