import { cookies } from 'next/headers';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('plex_user_token')?.value;

        if (!token) {
            return Response.json(
                { error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const res = await fetch(
            `https://plex.tv/api/v2/resources?X-Plex-Token=${token}`,
            {
                headers: {
                    Accept: 'application/json',
                    'X-Plex-Product': 'ShowMixer',
                    'X-Plex-Version': '1.0',
                    'X-Plex-Platform': 'Web',
                    'X-Plex-Client-Identifier': process.env.PLEX_CLIENT_ID,
                },
            }
        );

        if (!res.ok) {
            const body = await res.text();
            return Response.json(
                { error: 'Failed to fetch resources', details: body },
                { status: 502 }
            );
        }
        const data = await res.json();

        const servers = (data || []).filter((item) =>
            item.provides?.includes('server')
        );

        const simplified = servers.map((s) => ({
            name: s.name,
            machineId: s.clientIdentifier,
            accessToken: s.accessToken,
            connections: s.connections || [],
        }));

        return Response.json(simplified);
    } catch (error) {
        console.error('servers route error', err);
        return Response.json({ error: 'Unexpected error' }, { status: 500 });
    }
}
