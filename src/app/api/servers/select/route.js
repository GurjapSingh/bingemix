import { cookies } from 'next/headers';

const PROBE_TIMEOUT_MS = 4000;

async function probeConnection(uri, accessToken) {
    if (!uri) return { uri, ok: false, reason: 'missing uri' };
    const url = new URL('/identity', uri);
    url.searchParams.set('X-Plex-Token', accessToken);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        const ms = Date.now() - startedAt;
        console.log(
            `[servers/select] probe ${uri} -> ${res.status} ${res.statusText} (${ms}ms)`
        );
        return { uri, ok: res.ok, status: res.status };
    } catch (err) {
        const ms = Date.now() - startedAt;
        const reason =
            err?.name === 'AbortError'
                ? `timed out after ${PROBE_TIMEOUT_MS}ms`
                : String(err?.cause?.message || err?.message || err);
        console.log(`[servers/select] probe ${uri} -> FAILED (${ms}ms): ${reason}`);
        return { uri, ok: false, reason };
    } finally {
        clearTimeout(timeout);
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { machineId, accessToken, connections, uri } = body;

        if (!machineId || !accessToken) {
            return Response.json(
                { error: 'Machine id mismatch' },
                { status: 400 }
            );
        }

        // Accept either a pre-resolved `uri` (back-compat) or a list of
        // candidate `connections` to probe. This app may run on a different
        // network than the Plex server, so a "local" connection URI isn't
        // guaranteed to be reachable, and a "remote"/public one may be
        // blocked by NAT loopback if the app happens to share the LAN — so
        // every candidate is actually tested rather than guessed.
        const candidates = Array.isArray(connections)
            ? [...connections].sort((a, b) =>
                  a.local === b.local ? 0 : a.local ? -1 : 1
              )
            : uri
              ? [{ uri }]
              : [];

        if (candidates.length === 0) {
            return Response.json(
                { error: 'No server connection info provided' },
                { status: 400 }
            );
        }

        let workingUri = null;
        const attempts = [];
        for (const conn of candidates) {
            const result = await probeConnection(conn.uri, accessToken);
            attempts.push(result);
            if (result.ok) {
                workingUri = conn.uri;
                break;
            }
        }

        if (!workingUri) {
            console.log(
                '[servers/select] no reachable connection, attempts:',
                JSON.stringify(attempts)
            );
            return Response.json(
                {
                    error: 'Could not reach this Plex server',
                    details: attempts
                        .map((a) => `${a.uri}: ${a.ok ? 'ok' : a.reason || `HTTP ${a.status}`}`)
                        .join(' | '),
                    attempts,
                },
                { status: 502 }
            );
        }

        const cookieStore = await cookies();
        cookieStore.set(
            'plex_server',
            JSON.stringify({ machineId, accessToken, uri: workingUri }),
            {
                httpOnly: true,
                sameSite: 'lax',
                secure: req.nextUrl.protocol === 'https:',
                path: '/',
                maxAge: 60 * 60 * 24 * 30,
            }
        );
        return Response.json({ ok: true, uri: workingUri });
    } catch (error) {
        console.error('Error selecting server', error);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
