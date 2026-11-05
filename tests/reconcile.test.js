import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlexWorld, makeShow } from './helpers/plexWorld.js';
import { updateAccount, readAccount, withServerAuth } from '@/lib/stateStore.js';
import { reconcileAccount, reconcileAll } from '@/lib/reconcile.js';

let world;
let counter = 0;

/** A server with one TV library of one show and a playlist holding all its episodes. */
function addServerWithPlaylist(machineId, showTitle, { playlistKey } = {}) {
    const show = makeShow(showTitle, 2000, [4]);
    const server = world.addServer({
        machineId,
        libraries: [{ key: '1', type: 'show', title: 'TV', shows: [show] }],
    });
    const playlist = world.addPlaylist(machineId, { title: `${showTitle} mix`, episodes: show.episodes });
    if (playlistKey) playlist.ratingKey = playlistKey; // force an id clash across servers
    return { server, playlist, show };
}

async function enableAutoUpdate(accountId, entries) {
    await updateAccount(accountId, (account) => {
        let next = account;
        for (const { server, playlist } of entries) {
            next = withServerAuth(next, server.machineId, {
                plexUserToken: 'user-token',
                server: {
                    machineId: server.machineId,
                    uri: server.connections[0].uri,
                    accessToken: server.accessToken,
                },
            });
        }
        return {
            ...next,
            playlists: entries.map(({ server, playlist }, i) => ({
                id: `${accountId}-p${i}`,
                sourcePlaylistKey: playlist.ratingKey,
                serverMachineId: server.machineId,
                title: playlist.title,
                enabled: true,
                status: 'active',
            })),
        };
    });
}

const watch = (show, season, episode) => {
    show.episodes.find((e) => e.parentIndex === season && e.index === episode).viewCount += 1;
};

beforeEach(() => {
    world = new PlexWorld().install();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    counter++;
});

describe('removing watched episodes', () => {
    it('seeds a baseline first, then removes only episodes watched since', async () => {
        const a = addServerWithPlaylist('home', 'Office');
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [a]);

        await reconcileAccount(accountId); // first pass only records watch counts
        expect(a.playlist.items).toHaveLength(4);

        watch(a.show, 1, 2);
        await reconcileAccount(accountId);

        const left = a.playlist.items.map((i) => i.ep.index);
        expect(left).toEqual([1, 3, 4]);
    });

    it('does not remove an episode that was already watched before it was added', async () => {
        const show = makeShow('Old', 2000, [3], { watched: [[1, 1]] });
        const server = world.addServer({ machineId: 'home', libraries: [{ key: '1', type: 'show', title: 'TV', shows: [show] }] });
        const playlist = world.addPlaylist('home', { title: 'Old mix', episodes: show.episodes });
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [{ server, playlist }]);

        await reconcileAccount(accountId);
        await reconcileAccount(accountId);

        expect(playlist.items).toHaveLength(3);
    });

    it('records the poll time and clears errors on success', async () => {
        const a = addServerWithPlaylist('home', 'Office');
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [a]);
        await reconcileAccount(accountId);

        const entry = (await readAccount(accountId)).playlists[0];
        expect(entry.lastPolledAt).toBeTruthy();
        expect(entry.lastError).toBeNull();
    });
});

describe('several Plex servers on one account', () => {
    it('updates each playlist on its own server', async () => {
        const home = addServerWithPlaylist('home', 'Office');
        const cabin = addServerWithPlaylist('cabin', 'Parks');
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [home, cabin]);
        await reconcileAccount(accountId);

        watch(home.show, 1, 1);
        watch(cabin.show, 1, 4);
        await reconcileAccount(accountId);

        expect(home.playlist.items.map((i) => i.ep.index)).toEqual([2, 3, 4]);
        expect(cabin.playlist.items.map((i) => i.ep.index)).toEqual([1, 2, 3]);
    });

    it('playlists with the SAME id on two servers do not interfere', async () => {
        const home = addServerWithPlaylist('home', 'Office', { playlistKey: '777' });
        const cabin = addServerWithPlaylist('cabin', 'Parks', { playlistKey: '777' });
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [home, cabin]);
        await reconcileAccount(accountId);

        watch(home.show, 1, 1); // only the home playlist changes
        await reconcileAccount(accountId);

        expect(home.playlist.items).toHaveLength(3);
        expect(cabin.playlist.items).toHaveLength(4);
    });

    it('a rejected login on one server only pauses that server', async () => {
        const home = addServerWithPlaylist('home', 'Office');
        const cabin = addServerWithPlaylist('cabin', 'Parks');
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [home, cabin]);
        await reconcileAccount(accountId);

        home.server.accessToken = 'rotated'; // stored token no longer valid on home
        watch(home.show, 1, 1);
        watch(cabin.show, 1, 1);

        await expect(reconcileAccount(accountId)).rejects.toThrow(/401/);

        const account = await readAccount(accountId);
        expect(account.servers.home.invalid).toBe(true);
        expect(account.servers.cabin.invalid).toBe(false);
        expect(cabin.playlist.items).toHaveLength(3); // cabin still processed
        expect(home.playlist.items).toHaveLength(4); // home untouched

        // Once marked invalid, home is skipped without more failing calls.
        world.calls.length = 0;
        await reconcileAccount(accountId);
        expect(world.calls.some((c) => c.server === 'home')).toBe(false);
    });

    it('skips a server that is unreachable without breaking the other', async () => {
        const home = addServerWithPlaylist('home', 'Office');
        const cabin = addServerWithPlaylist('cabin', 'Parks');
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [home, cabin]);
        await reconcileAccount(accountId);

        home.server.reachable = []; // server is off
        watch(cabin.show, 1, 1);
        await reconcileAccount(accountId);

        expect(cabin.playlist.items).toHaveLength(3);
        const entries = (await readAccount(accountId)).playlists;
        expect(entries.find((p) => p.serverMachineId === 'home').lastError).toMatch(/fetch failed/);
        expect((await readAccount(accountId)).servers.home.invalid).toBe(false); // not an auth problem
    });
});

describe('playlists that disappear', () => {
    it('are marked missing and switched off when deleted in Plex', async () => {
        const a = addServerWithPlaylist('home', 'Office');
        const accountId = `acct-${counter}`;
        await enableAutoUpdate(accountId, [a]);
        await reconcileAccount(accountId);

        a.server.playlists = []; // deleted in Plex
        await reconcileAccount(accountId);

        const entry = (await readAccount(accountId)).playlists[0];
        expect(entry.status).toBe('missing');
        expect(entry.enabled).toBe(false);
        expect(entry.lastError).toMatch(/not found/i);
    });
});

describe('reconciling every account', () => {
    it('one account failing does not stop the others', async () => {
        const a = addServerWithPlaylist('home', 'Office');
        const b = addServerWithPlaylist('cabin', 'Parks');
        const alice = `alice-${counter}`;
        const bob = `bob-${counter}`;
        await enableAutoUpdate(alice, [a]);
        await enableAutoUpdate(bob, [b]);
        await reconcileAll(); // seed

        a.server.accessToken = 'rotated'; // alice's login breaks
        watch(a.show, 1, 1);
        watch(b.show, 1, 1);
        await reconcileAll(); // alice fails, bob must still be processed (and no throw: not all failed)

        expect(b.playlist.items).toHaveLength(3);
        expect((await readAccount(alice)).servers.home.invalid).toBe(true);
        expect((await readAccount(bob)).servers.cabin.invalid).toBe(false);
    });
});
