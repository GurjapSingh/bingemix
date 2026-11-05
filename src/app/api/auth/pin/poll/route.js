import { cookies } from 'next/headers';
import { getClientId } from '@/lib/clientId';
import { getPlexUser, getHomeUsers } from '@/lib/plexTv';
import { createSession, setActiveProfile } from '@/lib/session';
import { adoptLegacyData } from '@/lib/legacy';

export async function GET(req) {
    const searchParams = req.nextUrl.searchParams;
    const pinId = searchParams.get('pinId');
    if (!pinId) {
        return new Response('Missing pinId', { status: 400 });
    }

    const cookieStore = await cookies();
    if (cookieStore.get('plex_pin')?.value !== pinId) {
        return new Response('Unknown pin', { status: 403 });
    }

    const clientId = await getClientId();
    const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
        method: 'GET',
        headers: {
            'X-Plex-Product': 'Plex Show Mixer',
            'X-Plex-Version': '1.0',
            'X-Plex-Platform': 'Web',
            'X-Plex-Client-Identifier': clientId,
            Accept: 'application/json',
        },
    });

    if (!res.ok) {
        const body = await res.text();
        return Response.json(
            { error: 'Failed to poll Plex', details: body },
            { status: 502 }
        );
    }

    const data = await res.json();

    if (!data?.authToken) {
        return Response.json({ ok: false });
    }

    const token = data.authToken;
    const secure = req.nextUrl.protocol === 'https:';
    cookieStore.delete('plex_pin');

    try {
        const [user, homeUsers] = await Promise.all([
            getPlexUser(token),
            getHomeUsers(token),
        ]);
        const session = await createSession(token, { secure });

        // No Plex Home (or only one member): skip the profile picker.
        if (homeUsers.length <= 1) {
            await setActiveProfile(session, {
                accountId: user.id,
                title: user.title || user.username,
                token,
            });
            await adoptLegacyData(user.id);
            return Response.json({ ok: true, needsProfile: false });
        }

        return Response.json({
            ok: true,
            needsProfile: true,
            profiles: homeUsers,
        });
    } catch (err) {
        console.error('login error', err);
        return Response.json({ error: 'Login failed' }, { status: 500 });
    }
}
