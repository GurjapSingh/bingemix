import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
    DATA_DIR,
    readState,
    migrateStateFile,
    updateAccount,
    readAccount,
    withServerAuth,
    getServerAuth,
    getAnyAuth,
} from '@/lib/stateStore.js';

const STATE_FILE = path.join(DATA_DIR, 'state.json');
const writeRaw = (obj) => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj));
};
const readRaw = () => fs.readFileSync(STATE_FILE, 'utf-8');

const SERVER_A = { machineId: 'srv-a', uri: 'http://a:32400', accessToken: 'srv-a-token' };
const SERVER_B = { machineId: 'srv-b', uri: 'http://b:32400', accessToken: 'srv-b-token' };

beforeEach(() => {
    fs.rmSync(STATE_FILE, { force: true });
});

describe('upgrading the original single-user state (v1)', () => {
    const v1 = () => ({
        version: 1,
        auth: {
            plexUserToken: 'PLAINTEXT-USER-TOKEN',
            server: SERVER_A,
            invalid: false,
            invalidReason: null,
            savedAt: '2025-01-01T00:00:00Z',
        },
        playlists: [
            { id: 'p1', sourcePlaylistKey: '15442', title: 'Comedy', enabled: true },
            { id: 'p2', sourcePlaylistKey: '18091', title: 'Anime', enabled: false },
        ],
    });

    it('parks the old data under `legacy`, per server, with the token encrypted', async () => {
        writeRaw(v1());
        const state = await readState();

        expect(state.version).toBe(3);
        expect(state.accounts).toEqual({});
        expect(Object.keys(state.legacy.servers)).toEqual(['srv-a']);
        expect(state.legacy.playlists.map((p) => p.serverMachineId)).toEqual(['srv-a', 'srv-a']);
        expect(getAnyAuth(state.legacy).plexUserToken).toBe('PLAINTEXT-USER-TOKEN');
    });

    it('removes the plaintext token from disk once the file is rewritten', async () => {
        writeRaw(v1());
        expect(readRaw()).toContain('PLAINTEXT-USER-TOKEN');

        await migrateStateFile();

        expect(readRaw()).not.toContain('PLAINTEXT-USER-TOKEN');
        expect(JSON.parse(readRaw()).version).toBe(3);
    });

    it('is safe to run twice', async () => {
        writeRaw(v1());
        await migrateStateFile();
        const once = readRaw();
        await migrateStateFile();
        expect(readRaw()).toBe(once);
    });

    it('handles an empty/new install', async () => {
        const state = await readState();
        expect(state).toEqual({ version: 3, accounts: {} });
    });
});

describe('upgrading multi-user state with one auth slot (v2)', () => {
    it('moves the single auth into a per-server entry and tags playlists with that server', async () => {
        const { encrypt } = await import('@/lib/crypto.js');
        writeRaw({
            version: 2,
            accounts: {
                42: {
                    authEnc: encrypt({ plexUserToken: 'tok', server: SERVER_B }),
                    invalid: true,
                    invalidReason: 'Plex token rejected (401)',
                    savedAt: 'x',
                    playlists: [{ id: 'p', sourcePlaylistKey: '7', enabled: true }],
                },
            },
        });

        const account = (await readState()).accounts[42];
        expect(Object.keys(account.servers)).toEqual(['srv-b']);
        expect(account.servers['srv-b'].invalid).toBe(true);
        expect(getServerAuth(account, 'srv-b').server.accessToken).toBe('srv-b-token');
        expect(account.playlists[0].serverMachineId).toBe('srv-b');
    });
});

describe('per-server credentials', () => {
    it('keeps each server\'s credentials separate, so enabling one never overwrites another', async () => {
        await updateAccount('1', (a) =>
            withServerAuth(a, 'srv-a', { plexUserToken: 'tok', server: SERVER_A })
        );
        await updateAccount('1', (a) =>
            withServerAuth(a, 'srv-b', { plexUserToken: 'tok', server: SERVER_B })
        );

        const account = await readAccount('1');
        expect(Object.keys(account.servers).sort()).toEqual(['srv-a', 'srv-b']);
        expect(getServerAuth(account, 'srv-a').server.accessToken).toBe('srv-a-token');
        expect(getServerAuth(account, 'srv-b').server.accessToken).toBe('srv-b-token');
    });

    it('stores tokens encrypted, never in plaintext on disk', async () => {
        await updateAccount('1', (a) =>
            withServerAuth(a, 'srv-a', { plexUserToken: 'my-user-token', server: SERVER_A })
        );
        const raw = readRaw();
        expect(raw).not.toContain('my-user-token');
        expect(raw).not.toContain('srv-a-token');
    });

    it('re-saving credentials clears an earlier "invalid" flag for that server only', async () => {
        await updateAccount('1', (a) => {
            let next = withServerAuth(a, 'srv-a', { plexUserToken: 't', server: SERVER_A });
            next = withServerAuth(next, 'srv-b', { plexUserToken: 't', server: SERVER_B });
            next.servers['srv-a'].invalid = true;
            next.servers['srv-b'].invalid = true;
            return next;
        });
        await updateAccount('1', (a) =>
            withServerAuth(a, 'srv-a', { plexUserToken: 't2', server: SERVER_A })
        );
        const account = await readAccount('1');
        expect(account.servers['srv-a'].invalid).toBe(false);
        expect(account.servers['srv-b'].invalid).toBe(true);
    });

    it('accounts are isolated from each other', async () => {
        await updateAccount('1', (a) =>
            withServerAuth(a, 'srv-a', { plexUserToken: 'alice', server: SERVER_A })
        );
        expect(Object.keys((await readAccount('2')).servers)).toEqual([]);
    });
});
