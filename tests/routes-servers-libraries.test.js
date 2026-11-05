import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildScenario } from './helpers/scenario.js';
import { resetCookies } from './helpers/cookies.js';
import { req, loginAs, selectServer, currentSession } from './helpers/app.js';

vi.mock('next/headers', async () => (await import('./helpers/cookies.js')).headersMock);

let scenario;

beforeEach(() => {
    resetCookies();
    scenario = buildScenario();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

async function call(modulePath, method, path, body) {
    const mod = await import(modulePath);
    const res = await mod[method](req(path, { method, body }));
    return { res, data: await res.json() };
}

describe('seeing your servers', () => {
    it('lists every server the account has access to', async () => {
        await loginAs('tok-alice');
        const { data } = await call('@/app/api/servers/route', 'GET', '/api/servers');
        expect(data.map((s) => s.name).sort()).toEqual(['Cabin', 'Home Server']);
    });

    it('only lists servers shared with that account', async () => {
        await loginAs('tok-bob');
        const { data } = await call('@/app/api/servers/route', 'GET', '/api/servers');
        expect(data.map((s) => s.name)).toEqual(['Home Server']);
    });

    it('summarises connections without exposing addresses or access tokens', async () => {
        await loginAs('tok-alice');
        const { res, data } = await call('@/app/api/servers/route', 'GET', '/api/servers');
        expect(data.find((s) => s.machineId === 'home')).toEqual({
            name: 'Home Server',
            machineId: 'home',
            hasLocal: true,
            hasRemote: false,
        });
        expect(data.find((s) => s.machineId === 'cabin')).toMatchObject({ hasLocal: false, hasRemote: true });

        const text = JSON.stringify(data);
        expect(text).not.toMatch(/http|172\.17|srvtok/);
        expect(res.status).toBe(200);
    });
});

describe('selecting one of several servers', () => {
    it('connects to the one reachable address even when most reported ones are Docker/internal', async () => {
        await loginAs('tok-alice');
        const { res, data } = await call('@/app/api/servers/select/route', 'POST', '/api/servers/select', { machineId: 'home' });
        expect(res.status).toBe(200);
        expect(data).toEqual({ ok: true }); // no address leaked back

        const session = await currentSession();
        expect(session.server).toMatchObject({ machineId: 'home', uri: 'http://10.0.0.5:32400', accessToken: 'srvtok-home' });
    });

    it('uses the server\'s own access token, not the account token', async () => {
        await loginAs('tok-alice');
        await selectServer('cabin');
        expect((await currentSession()).server.accessToken).toBe('srvtok-cabin');
    });

    it('prefers a local connection over a remote one when both work', async () => {
        scenario.world.server('home').connections.push({ uri: 'https://home.example.com:32400', local: false });
        scenario.world.server('home').reachable.push('https://home.example.com:32400');
        await loginAs('tok-alice');
        await selectServer('home');
        expect((await currentSession()).server.uri).toBe('http://10.0.0.5:32400');
    });

    it('falls back to the remote address when the local one is not reachable', async () => {
        const home = scenario.world.server('home');
        home.connections.push({ uri: 'https://home.example.com:32400', local: false });
        home.reachable = ['https://home.example.com:32400']; // e.g. you're away from home
        await loginAs('tok-alice');
        await selectServer('home');
        expect((await currentSession()).server.uri).toBe('https://home.example.com:32400');
    });

    it('does not wait for unreachable addresses one by one', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        // All three addresses were tried up front; they were not retried sequentially.
        const probes = scenario.world.calls.filter((c) => c.path === '/identity');
        expect(probes).toHaveLength(3);
    });

    it('reports a clear, address-free error when nothing is reachable', async () => {
        scenario.world.server('home').reachable = [];
        await loginAs('tok-alice');
        const { res, data } = await call('@/app/api/servers/select/route', 'POST', '/api/servers/select', { machineId: 'home' });
        expect(res.status).toBe(502);
        expect(data.error).toMatch(/could not reach/i);
        expect(JSON.stringify(data)).not.toMatch(/172\.|10\.0\.0|EHOSTUNREACH/);
        expect((await currentSession()).server).toBeNull();
    });

    it('refuses a server the account has no access to', async () => {
        await loginAs('tok-bob');
        const { res } = await call('@/app/api/servers/select/route', 'POST', '/api/servers/select', { machineId: 'cabin' });
        expect(res.status).toBe(404);
    });

    it('requires a machine id', async () => {
        await loginAs('tok-alice');
        const { res } = await call('@/app/api/servers/select/route', 'POST', '/api/servers/select', {});
        expect(res.status).toBe(400);
    });

    it('switching servers clears the chosen library', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        await call('@/app/api/libraries/select/route', 'POST', '/api/libraries/select', { key: '1', title: 'TV Shows' });
        expect((await currentSession()).library).toMatchObject({ key: '1' });

        await selectServer('cabin');
        expect((await currentSession()).library).toBeNull();
    });

    it('can deselect a server', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        await call('@/app/api/servers/clear/route', 'POST', '/api/servers/clear');
        expect((await currentSession()).server).toBeNull();
    });
});

describe('a server with several TV libraries', () => {
    it('lists each TV library and leaves out movies', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        const { data } = await call('@/app/api/libraries/route', 'GET', '/api/libraries');
        expect(data.tvLibraries).toEqual([
            { key: '1', title: 'TV Shows' },
            { key: '3', title: 'Anime' },
        ]);
    });

    it('shows each server\'s own libraries', async () => {
        await loginAs('tok-alice');
        await selectServer('cabin');
        const { data } = await call('@/app/api/libraries/route', 'GET', '/api/libraries');
        expect(data.tvLibraries).toEqual([{ key: '1', title: 'Kids TV' }]);
    });

    it('search only looks inside the selected library', async () => {
        await loginAs('tok-alice');
        await selectServer('home');

        await call('@/app/api/libraries/select/route', 'POST', '/api/libraries/select', { key: '3', title: 'Anime' });
        let r = await call('@/app/api/search/route', 'GET', '/api/search?query=bebop');
        expect(r.data.results.map((x) => x.title)).toEqual(['Cowboy Bebop']);
        r = await call('@/app/api/search/route', 'GET', '/api/search?query=office');
        expect(r.data.results).toEqual([]); // The Office lives in the other library

        await call('@/app/api/libraries/select/route', 'POST', '/api/libraries/select', { key: '1', title: 'TV Shows' });
        r = await call('@/app/api/search/route', 'GET', '/api/search?query=office');
        expect(r.data.results.map((x) => x.title)).toEqual(['The Office (US)']);
    });

    it('search needs both a server and a library', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        const { res } = await call('@/app/api/search/route', 'GET', '/api/search?query=office');
        expect(res.status).toBe(401);
    });

    it('can deselect the library', async () => {
        await loginAs('tok-alice');
        await selectServer('home');
        await call('@/app/api/libraries/select/route', 'POST', '/api/libraries/select', { key: '1', title: 'TV Shows' });
        await call('@/app/api/libraries/clear/route', 'POST', '/api/libraries/clear');
        expect((await currentSession()).library).toBeNull();
    });
});

describe('episode details', () => {
    it('returns air date, runtime, rating and watched state', async () => {
        const { office } = scenario.shows;
        office.episodes[0].viewCount = 2;
        office.episodes[1].audienceRating = undefined; // falls back to the critic rating
        office.episodes[1].rating = 7.1;
        office.episodes[2].audienceRating = undefined;
        office.episodes[2].rating = undefined; // no rating at all

        await loginAs('tok-alice');
        await selectServer('home');
        const mod = await import('@/app/api/shows/[ratingKey]/episodes/route');
        const res = await mod.GET(req('/x'), { params: Promise.resolve({ ratingKey: office.ratingKey }) });
        const { episodes } = await res.json();

        expect(episodes[0]).toMatchObject({ season: 1, episode: 1, durationMs: 22 * 60000, rating: 8, watched: true });
        expect(episodes[0].airDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(episodes[1]).toMatchObject({ rating: 7.1, watched: false });
        expect(episodes[2].rating).toBeNull();
    });

    it('leaves out specials (season 0)', async () => {
        const { office } = scenario.shows;
        office.episodes.push({ ...office.episodes[0], ratingKey: '99999', parentIndex: 0, index: 1, title: 'Special' });
        await loginAs('tok-alice');
        await selectServer('home');
        const mod = await import('@/app/api/shows/[ratingKey]/episodes/route');
        const res = await mod.GET(req('/x'), { params: Promise.resolve({ ratingKey: office.ratingKey }) });
        const { episodes } = await res.json();
        expect(episodes.every((e) => e.season > 0)).toBe(true);
    });
});
