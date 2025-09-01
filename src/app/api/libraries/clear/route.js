import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();
    cookieStore.delete('plex_library');
    return Response.json({ ok: true });
}
