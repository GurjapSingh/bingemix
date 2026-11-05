import { requireSession, setSessionLibrary } from '@/lib/session';

export async function POST() {
    const { session, response } = await requireSession();
    if (response) return response;
    setSessionLibrary(session, null);
    return Response.json({ ok: true });
}
