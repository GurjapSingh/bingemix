import { cookies } from 'next/headers';
import { getClientId } from '@/lib/clientId';

export async function GET(req) {
    return createPin(req);
}
export async function POST(req) {
    return createPin(req);
}

async function createPin(req) {
    const clientId = await getClientId();
    const res = await fetch('https://plex.tv/api/v2/pins', {
        method: 'POST',
        headers: {
            'X-Plex-Product': 'Plex Show Mixer',
            'X-Plex-Version': '1.0',
            'X-Plex-Platform': 'Web',
            'X-Plex-Client-Identifier': clientId,
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        return new Response('Failed to get PIN from Plex', { status: 500 });
    }
    const data = await res.json();

    // Bind the pin to this browser so nobody else can poll it and receive
    // the resulting login.
    const cookieStore = await cookies();
    cookieStore.set('plex_pin', String(data.id), {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 15,
    });

    return Response.json({ id: data.id, code: data.code });
}
