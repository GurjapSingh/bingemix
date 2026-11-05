import { requireSession, setSessionServer } from '@/lib/session';
import { getServerResources } from '@/lib/plexTv';

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
        const { session, response } = await requireSession();
        if (response) return response;

        const { machineId } = await req.json();
        if (!machineId) {
            return Response.json({ error: 'machineId required' }, { status: 400 });
        }

        // Look the server up server-side: its access token never touches the browser.
        const resources = await getServerResources(session.token);
        const resource = resources.find((r) => r.clientIdentifier === machineId);
        if (!resource) {
            return Response.json({ error: 'Unknown server' }, { status: 404 });
        }
        const accessToken = resource.accessToken;

        // This app may run on a different network than the Plex server, so a
        // "local" connection URI isn't guaranteed to be reachable, and a
        // "remote"/public one may be blocked by NAT loopback if the app
        // happens to share the LAN, so every candidate is actually tested.
        const candidates = [...(resource.connections || [])].sort((a, b) =>
            a.local === b.local ? 0 : a.local ? -1 : 1
        );

        if (candidates.length === 0) {
            return Response.json(
                { error: 'No server connection info available' },
                { status: 400 }
            );
        }

        // Probe every candidate at once (each has its own timeout), then take
        // the highest-priority one that works. Waiting in priority order means
        // a fast local connection wins immediately, while unreachable ones
        // (e.g. the server's Docker bridge addresses) don't slow things down.
        const probes = candidates.map((conn) =>
            probeConnection(conn.uri, accessToken)
        );
        let workingUri = null;
        const attempts = [];
        for (const probe of probes) {
            const result = await probe;
            attempts.push(result);
            if (result.ok) {
                workingUri = result.uri;
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
                    details:
                        'No address for this server could be reached from where the app is running. Check that the app can reach your Plex server on the network.',
                },
                { status: 502 }
            );
        }

        setSessionServer(session, { machineId, accessToken, uri: workingUri });
        return Response.json({ ok: true });
    } catch (error) {
        console.error('Error selecting server', error);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
