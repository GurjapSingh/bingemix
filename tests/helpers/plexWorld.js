import { vi } from 'vitest';

/**
 * A small fake of plex.tv plus any number of Plex Media Servers, answering the
 * same requests (and in the same JSON shapes) as the real thing for everything
 * this app calls. Install it with `world.install()`; it replaces global fetch.
 *
 *   const world = new PlexWorld();
 *   const home = world.addServer({ machineId: 'home', libraries: [...] });
 *   world.addUser({ token: 'tok-alice', id: 1, servers: ['home'] });
 *   world.install();
 */

let counter = 1000;
const nextId = () => String(counter++);

export function makeShow(title, year, seasonSizes, { watched = [] } = {}) {
    const ratingKey = nextId();
    const episodes = [];
    seasonSizes.forEach((count, s) => {
        for (let e = 1; e <= count; e++) {
            episodes.push({
                ratingKey: nextId(),
                type: 'episode',
                grandparentRatingKey: ratingKey,
                grandparentTitle: title,
                parentIndex: s + 1,
                index: e,
                title: `${title} S${s + 1}E${e}`,
                originallyAvailableAt: `${2000 + s}-0${(e % 9) + 1}-15`,
                duration: 22 * 60 * 1000,
                audienceRating: 8.0,
                viewCount: 0,
            });
        }
    });
    for (const [s, e] of watched) {
        const ep = episodes.find((x) => x.parentIndex === s && x.index === e);
        if (ep) ep.viewCount = 1;
    }
    return { ratingKey, type: 'show', title, year, episodes };
}

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const container = (extra) => ({ MediaContainer: { size: 0, ...extra } });

export class PlexWorld {
    constructor() {
        this.servers = [];
        this.users = new Map(); // plex.tv token -> user
        this.pins = new Map(); // pin id -> { code, authToken }
        this.calls = []; // every request, for assertions
    }

    /**
     * libraries: [{ key, type: 'show'|'movie', title, shows: [makeShow(...)] }]
     * connections: [{ uri, local }]; `reachable` lists the URIs that answer.
     */
    addServer({
        machineId,
        name = machineId,
        accessToken = `srvtok-${machineId}`,
        connections,
        reachable,
        libraries = [],
    }) {
        const conns = connections ?? [
            { uri: `http://${machineId}.lan:32400`, local: true },
        ];
        const server = {
            machineId,
            name,
            accessToken,
            connections: conns,
            reachable: reachable ?? conns.map((c) => c.uri),
            libraries,
            playlists: [],
        };
        this.servers.push(server);
        return server;
    }

    /**
     * home: [{ id, uuid, title, protected, pin, token }] makes a Plex Home.
     * `token` is the token Plex hands out when switching to that profile.
     */
    addUser({ token, id, uuid = `uuid-${id}`, title = `user${id}`, servers = [], home = [] }) {
        const user = { token, id, uuid, title, servers, home };
        this.users.set(token, user);
        return user;
    }

    server(machineId) {
        return this.servers.find((s) => s.machineId === machineId);
    }

    addPlaylist(machineId, { title, episodes = [], summary = '' }) {
        const server = this.server(machineId);
        const playlist = {
            ratingKey: nextId(),
            title,
            summary,
            items: episodes.map((ep) => ({ playlistItemID: nextId(), ep })),
        };
        server.playlists.push(playlist);
        return playlist;
    }

    install() {
        globalThis.fetch = vi.fn((input, init) => this.handle(input, init));
        return this;
    }

    // ---------------------------------------------------------------- plex.tv

    async handle(input, init = {}) {
        const url = new URL(String(input));
        const method = (init.method || 'GET').toUpperCase();
        if (url.hostname === 'plex.tv') return this.handlePlexTv(url, method, init);
        return this.handlePms(url, method);
    }

    tokenOf(url, init) {
        const h = init?.headers || {};
        return (
            url.searchParams.get('X-Plex-Token') ||
            h['X-Plex-Token'] ||
            h['x-plex-token'] ||
            null
        );
    }

    handlePlexTv(url, method, init) {
        const token = this.tokenOf(url, init);
        this.calls.push({ host: 'plex.tv', method, path: url.pathname });

        const pin = /^\/api\/v2\/pins\/(\d+)$/.exec(url.pathname);
        if (pin) {
            const p = this.pins.get(pin[1]);
            return json(p ? { id: Number(pin[1]), code: p.code, authToken: p.authToken } : {}, p ? 200 : 404);
        }
        if (url.pathname === '/api/v2/pins' && method === 'POST') {
            const id = nextId();
            this.pins.set(id, { code: 'ABCD', authToken: null });
            return json({ id: Number(id), code: 'ABCD' });
        }

        const user = this.users.get(token);
        if (!user) return json({ error: 'unauthorized' }, 401);

        if (url.pathname === '/api/v2/user') {
            return json({ id: user.id, uuid: user.uuid, title: user.title, username: user.title });
        }

        if (url.pathname === '/api/v2/resources') {
            return json(
                this.servers
                    .filter((s) => user.servers.includes(s.machineId))
                    .map((s) => ({
                        name: s.name,
                        provides: 'server',
                        clientIdentifier: s.machineId,
                        accessToken: s.accessToken,
                        connections: s.connections.map((c) => ({
                            uri: c.uri,
                            local: c.local,
                            relay: false,
                        })),
                    }))
            );
        }

        if (url.pathname === '/api/v2/home/users') {
            if (user.home.length === 0) return json({}, 404);
            return json({ users: user.home.map(({ pin, token: t, ...rest }) => rest) });
        }

        const sw = /^\/api\/v2\/home\/users\/([^/]+)\/switch$/.exec(url.pathname);
        if (sw && method === 'POST') {
            const target = user.home.find((h) => h.uuid === decodeURIComponent(sw[1]));
            if (!target) return json({}, 404);
            if (target.protected && url.searchParams.get('pin') !== target.pin) {
                return json({ error: 'bad pin' }, 401);
            }
            return json({ authToken: target.token });
        }

        return json({ error: 'not handled' }, 404);
    }

    // --------------------------------------------------- Plex Media Server

    handlePms(url, method) {
        const server = this.servers.find((s) =>
            s.connections.some((c) => new URL(c.uri).origin === url.origin)
        );
        const unreachable = !server || !server.reachable.some((u) => new URL(u).origin === url.origin);
        if (unreachable) {
            this.calls.push({ host: url.origin, method, path: url.pathname, unreachable: true });
            const err = new TypeError('fetch failed');
            err.cause = { message: `connect EHOSTUNREACH ${url.host}` };
            throw err;
        }

        this.calls.push({ server: server.machineId, method, path: url.pathname });
        if (url.searchParams.get('X-Plex-Token') !== server.accessToken) {
            return json({ error: 'unauthorized' }, 401);
        }

        // Tests can make a specific request fail: world.failWhen = (url, method) => status | null
        const forced = this.failWhen?.(url, method);
        if (forced) return json({ error: 'forced failure' }, forced);

        const p = url.pathname;

        if (p === '/identity') {
            return json(container({ machineIdentifier: server.machineId }));
        }

        if (p === '/library/sections') {
            return json(
                container({
                    Directory: server.libraries.map((l) => ({
                        key: l.key,
                        type: l.type,
                        title: l.title,
                    })),
                })
            );
        }

        const all = /^\/library\/sections\/([^/]+)\/all$/.exec(p);
        if (all) {
            const lib = server.libraries.find((l) => l.key === all[1]);
            if (!lib) return json({}, 404);
            const title = (url.searchParams.get('title') || '').toLowerCase();
            const shows = lib.shows.filter((s) => s.title.toLowerCase().includes(title));
            return json(
                container({
                    Metadata: shows.map((s) => ({
                        ratingKey: s.ratingKey,
                        title: s.title,
                        year: s.year,
                        type: 'show',
                    })),
                })
            );
        }

        const leaves = /^\/library\/metadata\/([^/]+)\/allLeaves$/.exec(p);
        if (leaves) {
            const show = this.findShow(server, leaves[1]);
            if (!show) return json({}, 404);
            return json(container({ Metadata: show.episodes.map((e) => ({ ...e })) }));
        }

        const meta = /^\/library\/metadata\/([\d,]+)$/.exec(p);
        if (meta) {
            const found = meta[1]
                .split(',')
                .map((k) => this.findEpisode(server, k))
                .filter(Boolean);
            return json(container({ Metadata: found.map((e) => ({ ...e })) }));
        }

        return this.handlePlaylists(server, url, method);
    }

    findShow(server, key) {
        for (const lib of server.libraries) {
            const s = lib.shows?.find((x) => x.ratingKey === String(key));
            if (s) return s;
        }
        return null;
    }

    findEpisode(server, key) {
        for (const lib of server.libraries) {
            for (const s of lib.shows || []) {
                const e = s.episodes.find((x) => x.ratingKey === String(key));
                if (e) return e;
            }
        }
        return null;
    }

    playlistItemJson(item) {
        return { ...item.ep, playlistItemID: item.playlistItemID };
    }

    handlePlaylists(server, url, method) {
        const p = url.pathname;

        if (p === '/playlists' && method === 'GET') {
            return json(
                container({
                    Metadata: server.playlists.map((pl) => ({
                        ratingKey: pl.ratingKey,
                        title: pl.title,
                        summary: pl.summary,
                        playlistType: 'video',
                        smart: false,
                        leafCount: pl.items.length,
                    })),
                })
            );
        }

        if (p === '/playlists' && method === 'POST') {
            const seed = /\/library\/metadata\/(\d+)$/.exec(url.searchParams.get('uri') || '');
            const ep = seed && this.findEpisode(server, seed[1]);
            const pl = {
                ratingKey: nextId(),
                title: url.searchParams.get('title'),
                summary: '',
                items: ep ? [{ playlistItemID: nextId(), ep }] : [],
            };
            server.playlists.push(pl);
            return json(container({ Metadata: [{ ratingKey: pl.ratingKey, title: pl.title }] }));
        }

        const items = /^\/playlists\/([^/]+)\/items$/.exec(p);
        const item = /^\/playlists\/([^/]+)\/items\/([^/]+)$/.exec(p);
        const move = /^\/playlists\/([^/]+)\/items\/([^/]+)\/move$/.exec(p);
        const one = /^\/playlists\/([^/]+)$/.exec(p);
        const key = (items || move || item || one)?.[1];
        const pl = key && server.playlists.find((x) => x.ratingKey === key);
        if (!pl) return json({}, 404);

        if (items && method === 'GET') {
            return json(container({ Metadata: pl.items.map((i) => this.playlistItemJson(i)) }));
        }

        if (items && method === 'PUT') {
            const uri = url.searchParams.get('uri') || '';
            const ids = uri.split('/metadata/')[1]?.split(',') ?? [];
            for (const id of ids) {
                const ep = this.findEpisode(server, id);
                if (ep) pl.items.push({ playlistItemID: nextId(), ep });
            }
            return json(container({}));
        }

        if (move && method === 'PUT') {
            const idx = pl.items.findIndex((i) => i.playlistItemID === move[2]);
            if (idx < 0) return json({}, 404);
            const [moved] = pl.items.splice(idx, 1);
            const after = url.searchParams.get('after');
            const at = after ? pl.items.findIndex((i) => i.playlistItemID === after) + 1 : 0;
            pl.items.splice(at, 0, moved);
            return json(container({}));
        }

        if (item && method === 'DELETE') {
            const before = pl.items.length;
            pl.items = pl.items.filter((i) => i.playlistItemID !== item[2]);
            return pl.items.length === before ? json({}, 404) : new Response(null, { status: 204 });
        }

        if (one && method === 'GET') {
            return json(
                container({
                    Metadata: [
                        { ratingKey: pl.ratingKey, title: pl.title, summary: pl.summary, playlistType: 'video' },
                    ],
                })
            );
        }

        if (one && method === 'PUT') {
            if (url.searchParams.has('summary')) pl.summary = url.searchParams.get('summary');
            if (url.searchParams.has('title')) pl.title = url.searchParams.get('title');
            return json(container({}));
        }

        if (one && method === 'DELETE') {
            server.playlists = server.playlists.filter((x) => x !== pl);
            return new Response(null, { status: 204 });
        }

        return json({ error: 'not handled' }, 404);
    }
}
