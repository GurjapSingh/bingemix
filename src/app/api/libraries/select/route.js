import { requireSession, setSessionLibrary } from '@/lib/session';

export async function POST(req) {
    try {
        const { session, response } = await requireSession({ server: true });
        if (response) return response;

        const { key, title } = await req.json();
        setSessionLibrary(session, { key: String(key), title });
        return Response.json({ ok: true });
    } catch (e) {
        console.error('Error selecting library', e);
        return Response.json({ error: 'Library error' }, { status: 500 });
    }
}
