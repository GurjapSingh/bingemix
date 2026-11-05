import { requireSession, setSessionServer } from '@/lib/session';

export async function POST() {
    const { session, response } = await requireSession();
    if (response) return response;
    setSessionServer(session, null);
    return Response.json({ ok: true });
}
