import { NextRequest } from 'next/server';
import { expect } from 'vitest';

export function req(path, { method = 'GET', body } = {}) {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

/** Logs in as the plex.tv account that owns `token`, like finishing the link flow. */
export async function loginAs(token) {
    const { createSession, setActiveProfile } = await import('@/lib/session');
    const { getPlexUser } = await import('@/lib/plexTv');
    const session = await createSession(token, {});
    const user = await getPlexUser(token);
    await setActiveProfile(session, {
        accountId: user.id,
        title: user.title,
        token,
    });
    return String(user.id);
}

/** Selects a server through the real route. */
export async function selectServer(machineId) {
    const { POST } = await import('@/app/api/servers/select/route');
    const res = await POST(req('/api/servers/select', { method: 'POST', body: { machineId } }));
    expect(res.status).toBe(200);
}

export async function currentSession() {
    const { getSession } = await import('@/lib/session');
    return getSession();
}

/** Reads a newline-delimited JSON response (progress streams). */
export async function readEvents(res) {
    const text = await res.text();
    return text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

/** Empties the saved state so tests don't see each other's accounts. */
export async function resetState() {
    const { writeState } = await import('@/lib/stateStore.js');
    await writeState({ version: 3, accounts: {} });
}
