import { PlexWorld, makeShow } from './plexWorld.js';

/**
 * Alice (and Bob) with a realistic mix:
 *   home  - LAN address + the Docker bridge addresses Plex also reports (unreachable
 *           from outside), three libraries: TV Shows, Movies, Anime
 *   cabin - only reachable through its public address, one library: Kids TV
 * Alice can see both servers; Bob only `home`.
 */
export function buildScenario() {
    const world = new PlexWorld();

    const office = makeShow('The Office (US)', 2005, [6, 22]);
    const parks = makeShow('Parks and Recreation', 2009, [6, 24]);
    const bebop = makeShow('Cowboy Bebop', 1998, [26]);
    const bluey = makeShow('Bluey', 2018, [5]);

    world.addServer({
        machineId: 'home',
        name: 'Home Server',
        connections: [
            { uri: 'http://172.17.0.1:32400', local: true },
            { uri: 'http://10.0.0.5:32400', local: true },
            { uri: 'http://192.168.48.1:32400', local: true },
        ],
        reachable: ['http://10.0.0.5:32400'],
        libraries: [
            { key: '1', type: 'show', title: 'TV Shows', shows: [office, parks] },
            { key: '2', type: 'movie', title: 'Movies', shows: [] },
            { key: '3', type: 'show', title: 'Anime', shows: [bebop] },
        ],
    });

    world.addServer({
        machineId: 'cabin',
        name: 'Cabin',
        connections: [{ uri: 'https://cabin.example.com:32400', local: false }],
        libraries: [{ key: '1', type: 'show', title: 'Kids TV', shows: [bluey] }],
    });

    world.addUser({ token: 'tok-alice', id: 1, title: 'alice', servers: ['home', 'cabin'] });
    world.addUser({ token: 'tok-bob', id: 2, title: 'bob', servers: ['home'] });

    world.install();
    return { world, shows: { office, parks, bebop, bluey } };
}
