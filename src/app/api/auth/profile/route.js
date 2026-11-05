import { getSession, setActiveProfile } from '@/lib/session';
import { getPlexUser, getHomeUsers, switchHomeUser } from '@/lib/plexTv';
import { adoptLegacyData } from '@/lib/legacy';

export async function POST(req) {
    try {
        const session = await getSession();
        if (!session) {
            return Response.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { uuid, pin } = await req.json();
        if (!uuid) {
            return Response.json({ error: 'uuid required' }, { status: 400 });
        }

        // Only allow profiles that really belong to this login's Plex Home.
        const profiles = await getHomeUsers(session.adminToken);
        const profile = profiles.find((p) => p.uuid === uuid);
        if (!profile) {
            return Response.json({ error: 'Unknown profile' }, { status: 404 });
        }

        let token;
        try {
            const adminUser = await getPlexUser(session.adminToken);
            token =
                adminUser?.uuid === uuid
                    ? session.adminToken
                    : await switchHomeUser(session.adminToken, uuid, pin);
        } catch (err) {
            const wrongPin = err.status === 401 || err.status === 403;
            return Response.json(
                { error: wrongPin ? 'Incorrect PIN' : 'Could not switch profile' },
                { status: wrongPin ? 403 : 502 }
            );
        }

        const user = await getPlexUser(token);
        await setActiveProfile(session, {
            accountId: user.id,
            title: profile.title,
            token,
        });
        await adoptLegacyData(user.id);

        return Response.json({ ok: true, title: profile.title });
    } catch (err) {
        console.error('profile switch error', err);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
