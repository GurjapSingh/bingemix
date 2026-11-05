import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildScenario } from './helpers/scenario.js';
import { resetCookies } from './helpers/cookies.js';
import { req, currentSession, resetState, loginAs, selectServer } from './helpers/app.js';
import { DATA_DIR, readState, readAccount } from '@/lib/stateStore.js';
import { setBaseline, getBaselines, scopedKey } from '@/lib/db.js';

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

const route = (p) => import(p);
const get = async (p, path) => (await route(p)).GET(req(path));

/** Walks through the "link your Plex account" flow, like the setup page does. */
async function link(token) {
    const start = await (await route('@/app/api/auth/pin/start/route')).POST(req('/api/auth/pin/start', { method: 'POST' }));
    const { id, code } = await start.json();
    expect(code).toBe('ABCD');
    const poll = () => get('@/app/api/auth/pin/poll/route', `/api/auth/pin/poll?pinId=${id}`);

    const before = await poll();
    expect(await before.json()).toEqual({ ok: false }); // nobody has entered the code yet

    world.pins.get(String(id)).authToken = token; // the user enters the code at plex.tv/link
    const res = await poll();
    return { status: res.status, data: await res.json() };
}

function addFamilyAccount() {
    world.addUser({
        token: 'tok-family',
        id: 10,
        uuid: 'u-10',
        title: 'Parent',
        servers: ['home'],
        home: [
            { id: 10, uuid: 'u-10', title: 'Parent', admin: true, protected: false, token: 'tok-family' },
            { id: 11, uuid: 'u-11', title: 'Kid', admin: false, protected: true, pin: '1234', token: 'tok-kid' },
            { id: 12, uuid: 'u-12', title: 'Teen', admin: false, protected: false, token: 'tok-teen' },
        ],
    });
    world.addUser({ token: 'tok-kid', id: 11, uuid: 'u-11', title: 'Kid', servers: ['home'] });
    world.addUser({ token: 'tok-teen', id: 12, uuid: 'u-12', title: 'Teen', servers: ['cabin'] });
}

describe('linking a plain Plex account', () => {
    it('signs in straight away when there is no Plex Home to choose from', async () => {
        const { status, data } = await link('tok-alice');
        expect(status).toBe(200);
        expect(data).toEqual({ ok: true, needsProfile: false });

        const session = await currentSession();
        expect(session).toMatchObject({ accountId: '1', profileTitle: 'alice', token: 'tok-alice' });
    });

    it('the pin can only be collected by the browser that started it', async () => {
        const start = await (await route('@/app/api/auth/pin/start/route')).POST(req('/x', { method: 'POST' }));
        const { id } = await start.json();
        world.pins.get(String(id)).authToken = 'tok-alice';

        resetCookies(); // a different browser
        const res = await get('@/app/api/auth/pin/poll/route', `/api/auth/pin/poll?pinId=${id}`);
        expect(res.status).toBe(403);
        expect(await currentSession()).toBeNull();
    });

    it('/api/auth/me reports who is signed in', async () => {
        await link('tok-alice');
        const res = await get('@/app/api/auth/me/route', '/api/auth/me');
        expect(await res.json()).toEqual({
            accountId: '1',
            title: 'alice',
            profileSelected: true,
            instance: { host: 'test-host', id: expect.stringMatching(/^[a-z0-9]{1,8}$/) },
        });
    });

    it('/api/auth/me is 401 when signed out', async () => {
        expect((await get('@/app/api/auth/me/route', '/api/auth/me')).status).toBe(401);
    });
});

describe('a Plex Home with managed profiles', () => {
    beforeEach(addFamilyAccount);

    it('asks which profile to use, without leaking tokens or PINs', async () => {
        const { data } = await link('tok-family');
        expect(data.ok).toBe(true);
        expect(data.needsProfile).toBe(true);
        expect(data.profiles.map((p) => p.title)).toEqual(['Parent', 'Kid', 'Teen']);
        expect(data.profiles.find((p) => p.title === 'Kid').protected).toBe(true);

        const text = JSON.stringify(data);
        expect(text).not.toMatch(/tok-|1234/);

        // Linked, but no profile chosen yet: nothing else works.
        expect((await currentSession()).accountId).toBeNull();
        const { GET } = await route('@/app/api/servers/route');
        expect((await GET()).status).toBe(401);
    });

    async function chooseProfile(uuid, pin) {
        const { POST } = await route('@/app/api/auth/profile/route');
        return POST(req('/api/auth/profile', { method: 'POST', body: { uuid, pin } }));
    }

    it('lets you pick an unprotected profile', async () => {
        await link('tok-family');
        const res = await chooseProfile('u-12');
        expect(res.status).toBe(200);
        expect(await currentSession()).toMatchObject({ accountId: '12', profileTitle: 'Teen', token: 'tok-teen' });
    });

    it('asks for the PIN on a protected profile, and rejects a wrong one', async () => {
        await link('tok-family');
        expect((await chooseProfile('u-11')).status).toBe(403);
        expect((await chooseProfile('u-11', '0000')).status).toBe(403);
        expect((await currentSession()).accountId).toBeNull();

        const ok = await chooseProfile('u-11', '1234');
        expect(ok.status).toBe(200);
        expect(await currentSession()).toMatchObject({ accountId: '11', profileTitle: 'Kid', token: 'tok-kid' });
    });

    it('the PIN is never stored', async () => {
        await link('tok-family');
        await chooseProfile('u-11', '1234');
        const file = path.join(DATA_DIR, 'state.json');
        const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
        expect(raw).not.toContain('1234');
    });

    it('can use the Home admin\'s own profile without a PIN', async () => {
        await link('tok-family');
        const res = await chooseProfile('u-10');
        expect(res.status).toBe(200);
        expect((await currentSession()).token).toBe('tok-family');
    });

    it('refuses a profile that is not in this Plex Home', async () => {
        await link('tok-family');
        expect((await chooseProfile('u-999')).status).toBe(404);
    });

    it('each profile sees its own servers', async () => {
        await link('tok-family');
        const servers = async () => (await (await route('@/app/api/servers/route')).GET()).json();

        await chooseProfile('u-12'); // Teen only has the cabin
        expect((await servers()).map((s) => s.machineId)).toEqual(['cabin']);

        await chooseProfile('u-11', '1234'); // Kid only has the home server
        expect((await servers()).map((s) => s.machineId)).toEqual(['home']);
    });

    it('switching profile forgets the previous server and library choice', async () => {
        await link('tok-family');
        await chooseProfile('u-10');
        await selectServer('home');
        expect((await currentSession()).server).not.toBeNull();

        await chooseProfile('u-12');
        const session = await currentSession();
        expect(session.server).toBeNull();
        expect(session.library).toBeNull();
    });

    it('lists the profiles for the "switch profile" menu', async () => {
        await link('tok-family');
        await chooseProfile('u-12');
        const data = await (await get('@/app/api/auth/profiles/route', '/api/auth/profiles')).json();
        expect(data.profiles).toHaveLength(3);
        expect(data.activeAccountId).toBe('12');
    });

    it('each profile is its own account with separate data', async () => {
        await link('tok-family');
        await chooseProfile('u-12');
        const { updateAccount } = await import('@/lib/stateStore.js');
        await updateAccount('12', (a) => ({ ...a, playlists: [{ id: 'x', sourcePlaylistKey: '1', serverMachineId: 'cabin', enabled: true }] }));

        await chooseProfile('u-10');
        expect((await readAccount('10')).playlists).toHaveLength(0);
        expect((await readAccount('12')).playlists).toHaveLength(1);
    });
});

describe('moving an existing single-user install to accounts', () => {
    function writeOldState(token) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(
            path.join(DATA_DIR, 'state.json'),
            JSON.stringify({
                version: 1,
                auth: {
                    plexUserToken: token,
                    server: { machineId: 'home', uri: 'http://10.0.0.5:32400', accessToken: 'srvtok-home' },
                    invalid: false,
                    savedAt: 'x',
                },
                playlists: [{ id: 'p1', sourcePlaylistKey: '42', title: 'Old mix', enabled: true, status: 'active' }],
            })
        );
        setBaseline('', '42', '1001', 3); // pre-accounts rows have no owner
    }

    it('the account that owns the old token inherits the playlists and watch data', async () => {
        writeOldState('tok-alice');
        await link('tok-alice');

        const state = await readState();
        expect(state.legacy).toBeUndefined();
        const account = state.accounts['1'];
        expect(account.playlists).toMatchObject([{ sourcePlaylistKey: '42', serverMachineId: 'home', enabled: true }]);
        expect(Object.keys(account.servers)).toEqual(['home']);
        expect(getBaselines('1', scopedKey('home', '42')).get('1001')).toBe(3);

        // ...and the old plaintext token is gone from disk.
        expect(fs.readFileSync(path.join(DATA_DIR, 'state.json'), 'utf-8')).not.toContain('"tok-alice"');
    });

    it('does not hand one person\'s old data to someone else who logs in first', async () => {
        writeOldState('tok-alice');
        await link('tok-bob'); // Bob logs in before Alice

        const state = await readState();
        expect(state.accounts['1']?.playlists).toHaveLength(1); // still went to Alice (the token owner)
        expect(state.accounts['2']?.playlists ?? []).toHaveLength(0);
    });

    it('if the old token no longer works, the first person to log in gets the data', async () => {
        writeOldState('expired-token');
        await link('tok-bob');
        expect((await readAccount('2')).playlists).toHaveLength(1);
        expect(getBaselines('2', scopedKey('home', '42')).size).toBe(1);
    });
});

describe('logging out', () => {
    it('ends the session and stops auto-update', async () => {
        const pl = world.addPlaylist('home', { title: 'Mix', episodes: scenario.shows.office.episodes });
        const accountId = await loginAs('tok-alice');
        await selectServer('home');
        const au = await route('@/app/api/playlists/auto-update/route');
        await au.POST(req('/x', { method: 'POST', body: { playlistKey: pl.ratingKey, title: 'Mix', enabled: true } }));
        expect(pl.summary).toMatch(/Auto-updated by/);

        const res = await (await route('@/app/api/auth/logout/route')).POST();
        expect(res.status).toBe(200);

        expect(await currentSession()).toBeNull();
        const account = await readAccount(accountId);
        expect(account.servers).toEqual({}); // credentials removed
        expect(account.playlists.every((p) => !p.enabled)).toBe(true);
        expect(pl.summary).not.toMatch(/Auto-updated by/); // the note is cleared in Plex

        const { GET } = await route('@/app/api/playlists/route');
        expect((await GET()).status).toBe(401);
    });

    it('only affects the person logging out', async () => {
        const pl = world.addPlaylist('home', { title: 'Mix', episodes: scenario.shows.office.episodes });
        const au = await route('@/app/api/playlists/auto-update/route');
        const enable = () => au.POST(req('/x', { method: 'POST', body: { playlistKey: pl.ratingKey, title: 'Mix', enabled: true } }));

        const alice = await loginAs('tok-alice');
        await selectServer('home');
        await enable();

        resetCookies();
        const bob = await loginAs('tok-bob');
        await selectServer('home');
        await enable();
        await (await route('@/app/api/auth/logout/route')).POST();

        expect((await readAccount(bob)).playlists.every((p) => !p.enabled)).toBe(true);
        expect((await readAccount(alice)).playlists.some((p) => p.enabled)).toBe(true);
    });

    it('is harmless when nobody is signed in', async () => {
        const res = await (await route('@/app/api/auth/logout/route')).POST();
        expect(res.status).toBe(200);
    });
});
