import { describe, it, expect, beforeEach } from 'vitest';
import { PlexWorld, makeShow } from './helpers/plexWorld.js';
import { parseMarker, isStale, writeMarker, refreshMarker, ourInstance } from '@/lib/marker.js';

const HOUR = 60 * 60 * 1000;
// Markers already on playlists from before the Bingemix rename.
const line = (host, id, when) =>
    `Auto-updated by Plex Show Mixer (${host}) · last checked ${new Date(when).toISOString()} · id:${id}`;

describe('parsing the note', () => {
    it('reads host, time and instance id', () => {
        const m = parseMarker(`My own text\n\n${line('elitedesk', 'ab12cd34', Date.UTC(2026, 0, 2, 3, 4, 5))}`);
        expect(m).toEqual({
            host: 'elitedesk',
            lastChecked: '2026-01-02T03:04:05.000Z',
            instanceId: 'ab12cd34',
        });
    });

    it('reads the current Bingemix wording', () => {
        const m = parseMarker('Auto-updated by Bingemix (nas) · last checked 2026-01-02T03:04:05Z · id:cafe1234');
        expect(m).toEqual({
            host: 'nas',
            lastChecked: '2026-01-02T03:04:05.000Z',
            instanceId: 'cafe1234',
        });
    });

    it('still understands the earlier wording without "Plex"', () => {
        const m = parseMarker('Auto-updated by Show Mixer (old) · last checked 2026-01-02T03:04:05Z · id:deadbeef');
        expect(m.host).toBe('old');
    });

    it('ignores normal descriptions', () => {
        expect(parseMarker('Best comedies')).toBeNull();
        expect(parseMarker('')).toBeNull();
        expect(parseMarker(undefined)).toBeNull();
    });

    it('treats an old or unreadable timestamp as stale', () => {
        const now = Date.now();
        expect(isStale({ lastChecked: new Date(now - HOUR).toISOString() }, now)).toBe(false);
        expect(isStale({ lastChecked: new Date(now - 4 * HOUR).toISOString() }, now)).toBe(true);
        expect(isStale({ lastChecked: null }, now)).toBe(true);
    });
});

describe('writing the note into Plex', () => {
    let world, server, playlist, me, plexServer;

    beforeEach(async () => {
        world = new PlexWorld();
        server = world.addServer({
            machineId: 'home',
            libraries: [{ key: '1', type: 'show', title: 'TV', shows: [makeShow('Show', 2000, [3])] }],
        });
        playlist = world.addPlaylist('home', {
            title: 'Mix',
            summary: 'My favourite comedies',
            episodes: server.libraries[0].shows[0].episodes,
        });
        world.install();
        me = await ourInstance();
        plexServer = { machineId: 'home', uri: server.connections[0].uri, accessToken: server.accessToken };
    });

    it('appends the note and keeps the user\'s own description', async () => {
        await writeMarker(plexServer, playlist.ratingKey, true);
        expect(playlist.summary.startsWith('My favourite comedies\n\n')).toBe(true);
        expect(parseMarker(playlist.summary).instanceId).toBe(me.id);
        expect(parseMarker(playlist.summary).host).toBe('test-host');
    });

    it('works on a playlist with no description', async () => {
        playlist.summary = '';
        await writeMarker(plexServer, playlist.ratingKey, true);
        expect(playlist.summary.startsWith('Auto-updated by Bingemix')).toBe(true);
    });

    it('replaces its own note instead of stacking them', async () => {
        await writeMarker(plexServer, playlist.ratingKey, true);
        await writeMarker(plexServer, playlist.ratingKey, true);
        expect(playlist.summary.match(/Auto-updated by/g)).toHaveLength(1);
    });

    it('replaces a note written under the old name instead of stacking a second one', async () => {
        const me = await ourInstance();
        // Same install, upgraded: its earlier note used the old product name.
        playlist.summary = `My favourite comedies\n\n${line('test-host', me.id, Date.now() - HOUR)}`;
        await writeMarker(plexServer, playlist.ratingKey, true);
        expect(playlist.summary.match(/Auto-updated by/g)).toHaveLength(1);
        expect(playlist.summary).toContain('Auto-updated by Bingemix');
        expect(playlist.summary.startsWith('My favourite comedies\n\n')).toBe(true);
    });

    it('cleans up notes left behind by a mixed old/new run', async () => {
        const me = await ourInstance();
        const newer = `Auto-updated by Bingemix (a) · last checked ${new Date().toISOString()} · id:${me.id}`;
        playlist.summary = `My favourite comedies\n\n${newer}\n\n${line('b', me.id, Date.now() - HOUR)}`;
        await writeMarker(plexServer, playlist.ratingKey, false);
        expect(playlist.summary).toBe('My favourite comedies');
    });

    it('turning off removes only the note', async () => {
        await writeMarker(plexServer, playlist.ratingKey, true);
        await writeMarker(plexServer, playlist.ratingKey, false);
        expect(playlist.summary).toBe('My favourite comedies');
    });

    it('turning off never wipes another copy\'s note', async () => {
        playlist.summary = line('elitedesk', 'ffff0000', Date.now());
        await writeMarker(plexServer, playlist.ratingKey, false);
        expect(parseMarker(playlist.summary).instanceId).toBe('ffff0000');
    });

    it('refresh updates its own note', async () => {
        await writeMarker(plexServer, playlist.ratingKey, true);
        expect(await refreshMarker(plexServer, playlist.ratingKey)).toBe('written');
        expect(parseMarker(playlist.summary).instanceId).toBe(me.id);
    });

    it('refresh backs off when another copy checked recently', async () => {
        const theirs = line('elitedesk', 'ffff0000', Date.now() - 10 * 60 * 1000);
        playlist.summary = theirs;
        expect(await refreshMarker(plexServer, playlist.ratingKey)).toBe('conflict');
        expect(playlist.summary).toBe(theirs);
    });

    it('refresh takes over from a copy that has gone quiet', async () => {
        playlist.summary = line('elitedesk', 'ffff0000', Date.now() - 6 * HOUR);
        expect(await refreshMarker(plexServer, playlist.ratingKey)).toBe('written');
        expect(parseMarker(playlist.summary).instanceId).toBe(me.id);
    });
});
