import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildScenario } from './helpers/scenario.js';
import { makeShow } from './helpers/plexWorld.js';
import { resetCookies } from './helpers/cookies.js';
import { req, loginAs, selectServer, readEvents, resetState } from './helpers/app.js';
import { readAccount, getServerAuth } from '@/lib/stateStore.js';
import { getBaselines, getSavepoint, scopedKey } from '@/lib/db.js';
import { parseMarker } from '@/lib/marker.js';

vi.mock('next/headers', async () => (await import('./helpers/cookies.js')).headersMock);

let scenario, world;

beforeEach(async () => {
    await resetState();
    resetCookies();
    scenario = buildScenario();
    world = scenario.world;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

const route = async (p) => import(p);
const params = (o) => ({ params: Promise.resolve(o) });

async function listPlaylists() {
    const { GET } = await route('@/app/api/playlists/route');
    return (await GET()).json();
}

async function setAutoUpdate(playlist, enabled) {
    const { POST } = await route('@/app/api/playlists/auto-update/route');
    const res = await POST(req('/api/playlists/auto-update', {
        method: 'POST',
        body: { playlistKey: playlist.ratingKey, title: playlist.title, enabled },
    }));
    expect(res.status).toBe(200);
}

function seedPlaylist(machineId, title, episodes, forcedKey) {
    const playlist = world.addPlaylist(machineId, { title, episodes });
    if (forcedKey) playlist.ratingKey = forcedKey;
    return playlist;
}

describe('listing playlists', () => {
    it('shows the playlists on the selected server and hides "_watched" helpers', async () => {
        seedPlaylist('home', 'Comedy', scenario.shows.office.episodes);
        seedPlaylist('home', 'Comedy_watched', []);
        seedPlaylist('cabin', 'Kids mix', scenario.shows.bluey.episodes);

        await loginAs('tok-alice');
        await selectServer('home');
        expect((await listPlaylists()).playlists.map((p) => p.title)).toEqual(['Comedy']);

        await selectServer('cabin');
        expect((await listPlaylists()).playlists.map((p) => p.title)).toEqual(['Kids mix']);
    });
});

describe('auto-update with the same playlist id on two servers', () => {
    it('each server has its own on/off setting', async () => {
        seedPlaylist('home', 'Home mix', scenario.shows.office.episodes, '777');
        seedPlaylist('cabin', 'Cabin mix', scenario.shows.bluey.episodes, '777');

        await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(world.server('home').playlists[0], true);

        expect((await listPlaylists()).playlists[0].autoUpdateEnabled).toBe(true);

        await selectServer('cabin');
        expect((await listPlaylists()).playlists[0].autoUpdateEnabled).toBe(false); // not the home one

        await setAutoUpdate(world.server('cabin').playlists[0], true);
        await selectServer('home');
        await setAutoUpdate(world.server('home').playlists[0], false);

        await selectServer('cabin');
        expect((await listPlaylists()).playlists[0].autoUpdateEnabled).toBe(true); // unaffected by home
    });

    it('keeps separate encrypted credentials per server', async () => {
        seedPlaylist('home', 'Home mix', scenario.shows.office.episodes);
        seedPlaylist('cabin', 'Cabin mix', scenario.shows.bluey.episodes);

        const accountId = await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(world.server('home').playlists[0], true);
        await selectServer('cabin');
        await setAutoUpdate(world.server('cabin').playlists[0], true);

        const account = await readAccount(accountId);
        expect(getServerAuth(account, 'home').server.accessToken).toBe('srvtok-home');
        expect(getServerAuth(account, 'cabin').server.accessToken).toBe('srvtok-cabin');
        expect(account.playlists.map((p) => p.serverMachineId).sort()).toEqual(['cabin', 'home']);
    });

    it('deleting one removes only that server\'s entry and data', async () => {
        const homePl = seedPlaylist('home', 'Home mix', scenario.shows.office.episodes, '777');
        const cabinPl = seedPlaylist('cabin', 'Cabin mix', scenario.shows.bluey.episodes, '777');

        const accountId = await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(homePl, true);
        await selectServer('cabin');
        await setAutoUpdate(cabinPl, true);

        const { setBaseline, saveSavepoint } = await import('@/lib/db.js');
        setBaseline(accountId, scopedKey('home', '777'), '1', 1);
        setBaseline(accountId, scopedKey('cabin', '777'), '1', 1);
        saveSavepoint(accountId, scopedKey('home', '777'), [{ ratingKey: '1' }]);

        await selectServer('home');
        const { DELETE } = await route('@/app/api/playlists/[playlistKey]/route');
        const res = await DELETE(req('/x', { method: 'DELETE' }), params({ playlistKey: '777' }));
        expect(res.status).toBe(200);

        expect(world.server('home').playlists).toHaveLength(0);
        expect(world.server('cabin').playlists).toHaveLength(1);
        const account = await readAccount(accountId);
        expect(account.playlists.map((p) => p.serverMachineId)).toEqual(['cabin']);
        expect(getBaselines(accountId, scopedKey('home', '777')).size).toBe(0);
        expect(getBaselines(accountId, scopedKey('cabin', '777')).size).toBe(1);
        expect(getSavepoint(accountId, scopedKey('home', '777'))).toHaveLength(0);
    });

    it('save points are per server too', async () => {
        const homePl = seedPlaylist('home', 'Home mix', scenario.shows.office.episodes.slice(0, 3), '777');
        seedPlaylist('cabin', 'Cabin mix', scenario.shows.bluey.episodes, '777');

        const accountId = await loginAs('tok-alice');
        await selectServer('home');
        const sp = await route('@/app/api/playlists/[playlistKey]/savepoint/route');
        await sp.POST(req('/x', { method: 'POST' }), params({ playlistKey: '777' }));
        expect(getSavepoint(accountId, scopedKey('home', '777'))).toHaveLength(3);

        await selectServer('cabin');
        const res = await sp.GET(req('/x'), params({ playlistKey: '777' }));
        expect((await res.json()).savepoint).toBeNull(); // cabin's "777" has no save point
        expect(homePl.items).toHaveLength(3);
    });
});

describe('accounts are isolated', () => {
    it('one person\'s auto-update setting is not visible to another on the same server', async () => {
        const pl = seedPlaylist('home', 'Shared name', scenario.shows.office.episodes);

        await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(pl, true);
        expect((await listPlaylists()).playlists[0].autoUpdateEnabled).toBe(true);

        resetCookies();
        await loginAs('tok-bob');
        await selectServer('home');
        expect((await listPlaylists()).playlists[0].autoUpdateEnabled).toBe(false);
    });

    it('a second login does not replace the first person\'s saved credentials', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        const alice = await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(pl, true);
        const before = (await readAccount(alice)).servers.home.authEnc;

        resetCookies();
        const bob = await loginAs('tok-bob');
        await selectServer('home');
        await setAutoUpdate(pl, true);

        expect((await readAccount(alice)).servers.home.authEnc).toBe(before);
        expect(getServerAuth(await readAccount(bob), 'home').plexUserToken).toBe('tok-bob');
    });
});

describe('the "another copy is updating this" note', () => {
    const NOTE = (host, id, ageMs) =>
        `Auto-updated by Plex Show Mixer (${host}) · last checked ${new Date(Date.now() - ageMs).toISOString()} · id:${id}`;

    it('turning auto-update on leaves a note in Plex and keeps the description', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        pl.summary = 'Friday night';
        await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(pl, true);

        expect(pl.summary.startsWith('Friday night\n\n')).toBe(true);
        expect(parseMarker(pl.summary).host).toBe('test-host');
    });

    it('turning it off removes the note', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        pl.summary = 'Friday night';
        await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(pl, true);
        await setAutoUpdate(pl, false);
        expect(pl.summary).toBe('Friday night');
    });

    it('does not flag the playlist as taken by someone else when the note is its own', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        await loginAs('tok-alice');
        await selectServer('home');
        await setAutoUpdate(pl, true);
        expect((await listPlaylists()).playlists[0].externalAutoUpdate).toBeNull();
    });

    it('flags a playlist another copy of the app is updating', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        pl.summary = NOTE('elitedesk', 'aaaa1111', 5 * 60 * 1000);
        await loginAs('tok-alice');
        await selectServer('home');

        const [p] = (await listPlaylists()).playlists;
        expect(p.autoUpdateEnabled).toBe(false); // off in THIS app...
        expect(p.externalAutoUpdate).toMatchObject({ host: 'elitedesk', stale: false }); // ...but running elsewhere
    });

    it('marks it stale when that copy has not checked in for hours', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        pl.summary = NOTE('elitedesk', 'aaaa1111', 6 * 60 * 60 * 1000);
        await loginAs('tok-alice');
        await selectServer('home');
        expect((await listPlaylists()).playlists[0].externalAutoUpdate.stale).toBe(true);
    });

    it('a playlist with an ordinary description is not flagged', async () => {
        seedPlaylist('home', 'Mix', scenario.shows.office.episodes).summary = 'Best episodes ever';
        await loginAs('tok-alice');
        await selectServer('home');
        expect((await listPlaylists()).playlists[0].externalAutoUpdate).toBeNull();
    });

    it('a failure writing the note does not stop auto-update being switched on', async () => {
        const pl = seedPlaylist('home', 'Mix', scenario.shows.office.episodes);
        const accountId = await loginAs('tok-alice');
        await selectServer('home');
        world.failWhen = (url, method) => (method === 'PUT' && url.pathname === `/playlists/${pl.ratingKey}` ? 500 : null);

        await setAutoUpdate(pl, true);
        expect((await readAccount(accountId)).playlists[0].enabled).toBe(true);
    });
});

describe('creating a playlist (progress stream)', () => {
    async function create(title, keys) {
        const { POST } = await route('@/app/api/playlist/build/route');
        return POST(req('/api/playlist/build', { method: 'POST', body: { title, episodeKeys: keys } }));
    }

    it('reports each step and ends with the playlist id', async () => {
        const big = makeShow('Big Show', 2000, [250]);
        world.server('home').libraries[0].shows.push(big);
        const accountId = await loginAs('tok-alice');
        await selectServer('home');

        const keys = big.episodes.map((e) => e.ratingKey);
        const events = await readEvents(await create('Everything', keys));

        expect(events.map((e) => e.stage)).toEqual(['creating', 'adding', 'adding', 'adding', 'adding', 'finishing', 'done']);
        const adding = events.filter((e) => e.stage === 'adding');
        expect(adding.map((e) => e.done)).toEqual([1, 101, 201, 250]);
        expect(adding.every((e) => e.total === 250)).toBe(true);

        const done = events.at(-1);
        expect(done.added).toBe(250);

        // The playlist exists on the right server with every episode exactly once.
        const created = world.server('home').playlists.find((p) => p.ratingKey === done.playlistKey);
        expect(created.title).toBe('Everything');
        expect(created.items.map((i) => i.ep.ratingKey)).toEqual(keys);
        expect(world.server('cabin').playlists).toHaveLength(0);

        // Watch counts were recorded as the starting point for auto-update.
        expect(getBaselines(accountId, scopedKey('home', done.playlistKey)).size).toBe(250);
    });

    it('records the current watch counts as baselines', async () => {
        const show = makeShow('Seen', 2000, [3], { watched: [[1, 2]] });
        world.server('home').libraries[0].shows.push(show);
        const accountId = await loginAs('tok-alice');
        await selectServer('home');

        const keys = show.episodes.map((e) => e.ratingKey);
        const done = (await readEvents(await create('Seen mix', keys))).at(-1);
        const baselines = getBaselines(accountId, scopedKey('home', done.playlistKey));
        expect(baselines.get(show.episodes[1].ratingKey)).toBe(1); // watched once already
        expect(baselines.get(show.episodes[0].ratingKey)).toBe(0);
    });

    it('creates the playlist on whichever server is selected', async () => {
        await loginAs('tok-alice');
        await selectServer('cabin');
        const keys = scenario.shows.bluey.episodes.map((e) => e.ratingKey);
        await readEvents(await create('Kids', keys));
        expect(world.server('cabin').playlists.map((p) => p.title)).toEqual(['Kids']);
        expect(world.server('home').playlists).toHaveLength(0);
    });

    it('streams an error event if Plex refuses', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        world.failWhen = (url, method) => (method === 'POST' && url.pathname === '/playlists' ? 500 : null);
        const keys = scenario.shows.office.episodes.map((e) => e.ratingKey);
        const events = await readEvents(await create('Nope', keys));
        expect(events.at(-1)).toMatchObject({ stage: 'error' });
        expect(events.at(-1).error).toMatch(/could not create/i);
    });

    it('rejects an empty selection before streaming', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        const res = await create('Empty', []);
        expect(res.status).toBe(400);
    });

    it('needs a selected server', async () => {
        await loginAs('tok-alice');
        const res = await create('X', ['1']);
        expect(res.status).toBe(401);
    });
});

describe('updating a playlist (progress stream)', () => {
    it('replaces the contents in the new order and re-records baselines', async () => {
        const { office } = scenario.shows;
        const pl = seedPlaylist('home', 'Mix', office.episodes.slice(0, 5));
        const accountId = await loginAs('tok-alice');
        await selectServer('home');

        const reordered = [office.episodes[7], office.episodes[2], office.episodes[0]].map((e) => e.ratingKey);
        const { PUT } = await route('@/app/api/playlists/[playlistKey]/route');
        const res = await PUT(
            req('/x', { method: 'PUT', body: { episodeKeys: reordered } }),
            params({ playlistKey: pl.ratingKey })
        );
        const events = await readEvents(res);

        expect(events.filter((e) => e.stage === 'removing')).toHaveLength(5);
        expect(events.at(-1)).toMatchObject({ stage: 'done', count: 3 });
        expect(pl.items.map((i) => i.ep.ratingKey)).toEqual(reordered);
        expect(getBaselines(accountId, scopedKey('home', pl.ratingKey)).size).toBe(3);
    });
});

describe('everything needs a login', () => {
    const cases = [
        ['@/app/api/servers/route', 'GET'],
        ['@/app/api/servers/select/route', 'POST'],
        ['@/app/api/libraries/route', 'GET'],
        ['@/app/api/search/route', 'GET'],
        ['@/app/api/playlists/route', 'GET'],
        ['@/app/api/playlists/auto-update/route', 'POST'],
        ['@/app/api/playlists/auto-update/run/route', 'POST'],
        ['@/app/api/playlist/build/route', 'POST'],
    ];

    for (const [path, method] of cases) {
        it(`${method} ${path.replace('@/app', '')} returns 401 without a session`, async () => {
            const mod = await import(path);
            const body = method === 'POST' ? { machineId: 'home', playlistKey: '1', title: 't', episodeKeys: ['1'] } : undefined;
            const res = await mod[method](req('/x', { method, body }));
            expect(res.status).toBe(401);
        });
    }

    it('savepoint routes need a login', async () => {
        const sp = await route('@/app/api/playlists/[playlistKey]/savepoint/route');
        expect((await sp.GET(req('/x'), params({ playlistKey: '1' }))).status).toBe(401);
        expect((await sp.DELETE(req('/x', { method: 'DELETE' }), params({ playlistKey: '1' }))).status).toBe(401);
    });

    it('a forged session cookie is rejected', async () => {
        const { headersMock } = await import('./helpers/cookies.js');
        (await headersMock.cookies()).set('plex_session', 'forged-value');
        const { GET } = await route('@/app/api/playlists/route');
        expect((await GET()).status).toBe(401);
    });
});
