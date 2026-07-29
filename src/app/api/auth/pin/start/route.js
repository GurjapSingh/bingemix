import { getClientId } from '@/lib/clientId';

export async function GET() {
    return createPin();
}
export async function POST() {
    return createPin();
}

async function createPin() {
    const clientId = await getClientId();
    const res = await fetch('https://plex.tv/api/v2/pins', {
        method: 'POST',
        headers: {
            'X-Plex-Product': 'ShowMixer',
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
    return Response.json({ id: data.id, code: data.code });
}
