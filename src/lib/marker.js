import os from 'os';
import { getClientId } from './clientId.js';
import { getPlaylist, setPlaylistSummary } from './plexClient.js';

/**
 * Auto-update marker.
 *
 * Plex can't store hidden metadata on a playlist (labels are accepted but not
 * saved), so when a Plex Show Mixer copy auto-updates a playlist it appends one
 * line to the playlist description:
 *
 *   Auto-updated by Plex Show Mixer (elitedesk) · last checked 2026-11-05T20:15:00Z · id:ab12cd34
 *
 * Other copies of the app pointed at the same Plex server read it to tell the
 * user the playlist is already being handled elsewhere.
 */

const MARKER_RE =
    /\n*Auto-updated by (?:Plex )?Show Mixer \(([^)]*)\) · last checked (\S+) · id:([a-z0-9]+)\s*$/;

export const MARKER_REFRESH_MS = 60 * 60 * 1000; // rewrite at most hourly
export const MARKER_STALE_MS = 3 * 60 * 60 * 1000; // no check for 3h => likely stopped

export async function ourInstance() {
    const clientId = await getClientId();
    return {
        id: clientId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8),
        // Inside Docker os.hostname() is a container id; INSTANCE_NAME overrides it.
        host: (process.env.INSTANCE_NAME || os.hostname()).replace(/[()]/g, ''),
    };
}

export function parseMarker(summary) {
    const m = MARKER_RE.exec(summary || '');
    if (!m) return null;
    const lastChecked = new Date(m[2]);
    return {
        host: m[1],
        lastChecked: Number.isNaN(lastChecked.getTime()) ? null : lastChecked.toISOString(),
        instanceId: m[3],
    };
}

export function isStale(marker, now = Date.now()) {
    if (!marker?.lastChecked) return true;
    return now - new Date(marker.lastChecked).getTime() > MARKER_STALE_MS;
}

function stripMarker(summary) {
    return (summary || '').replace(MARKER_RE, '');
}

function buildSummary(summary, instance) {
    const base = stripMarker(summary);
    if (!instance) return base;
    const line = `Auto-updated by Plex Show Mixer (${instance.host}) · last checked ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')} · id:${instance.id}`;
    return base ? `${base}\n\n${line}` : line;
}

/** Turn our marker on (refreshing its time) or off. Preserves the user's own description. */
export async function writeMarker(server, playlistKey, on) {
    const playlist = await getPlaylist(server, playlistKey);
    if (!playlist) return;
    const current = parseMarker(playlist.summary);
    const instance = await ourInstance();

    // Never wipe another copy's active marker when turning ours off.
    if (!on && current && current.instanceId !== instance.id) return;

    await setPlaylistSummary(
        server,
        playlistKey,
        buildSummary(playlist.summary, on ? instance : null)
    );
}

/**
 * Called after a successful poll. Refreshes our marker unless another copy
 * has recently claimed the playlist. Returns 'written' | 'conflict'.
 */
export async function refreshMarker(server, playlistKey) {
    const playlist = await getPlaylist(server, playlistKey);
    if (!playlist) return 'conflict';
    const current = parseMarker(playlist.summary);
    const instance = await ourInstance();
    if (current && current.instanceId !== instance.id && !isStale(current)) {
        return 'conflict';
    }
    await setPlaylistSummary(server, playlistKey, buildSummary(playlist.summary, instance));
    return 'written';
}
