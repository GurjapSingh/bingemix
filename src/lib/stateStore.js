import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './paths.js';
import { encrypt, decrypt } from './crypto.js';

export { DATA_DIR };
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const TMP_FILE = `${STATE_FILE}.tmp`;
const STATE_VERSION = 3;

function defaultState() {
    return { version: STATE_VERSION, accounts: {} };
}

/**
 * An account (one Plex user/profile) owns:
 *   servers:   { [machineId]: { authEnc, invalid, invalidReason, savedAt } }
 *              encrypted credentials for background updates, per Plex server
 *   playlists: [{ ..., serverMachineId }]  auto-update entries
 */
export function emptyAccount() {
    return { servers: {}, playlists: [] };
}

/** Converts the v2 single-auth-slot account shape to the per-server shape. */
function normalizeAccount(b) {
    if (b.servers) return b;
    const servers = {};
    let machineId = null;
    if (b.authEnc) {
        try {
            machineId = decrypt(b.authEnc).server?.machineId ?? null;
        } catch {
            machineId = null; // unreadable (key changed): user must re-link
        }
        if (machineId) {
            servers[machineId] = {
                authEnc: b.authEnc,
                invalid: !!b.invalid,
                invalidReason: b.invalidReason ?? null,
                savedAt: b.savedAt ?? null,
            };
        }
    }
    return {
        servers,
        playlists: (b.playlists || []).map((p) => ({
            ...p,
            serverMachineId: p.serverMachineId ?? machineId,
        })),
    };
}

/**
 * v1: one plaintext `auth` slot + global playlists -> parked under `legacy`
 *     (token encrypted) until the owning account logs in.
 * v2: single auth slot per account -> per-server auth (v3).
 */
function migrate(raw) {
    if (raw.version === STATE_VERSION) {
        return { ...defaultState(), ...raw };
    }
    const next = defaultState();
    if (raw.version === 2) {
        for (const [id, account] of Object.entries(raw.accounts || {})) {
            next.accounts[id] = normalizeAccount(account);
        }
        if (raw.legacy) next.legacy = normalizeAccount(raw.legacy);
        return next;
    }
    if (raw.auth || (raw.playlists && raw.playlists.length > 0)) {
        next.legacy = normalizeAccount({
            authEnc: raw.auth
                ? encrypt({
                      plexUserToken: raw.auth.plexUserToken,
                      server: raw.auth.server,
                  })
                : null,
            invalid: !!raw.auth?.invalid,
            invalidReason: raw.auth?.invalidReason ?? null,
            savedAt: raw.auth?.savedAt ?? null,
            playlists: raw.playlists || [],
        });
    }
    return next;
}

let queue = Promise.resolve();

function enqueue(fn) {
    const result = queue.then(fn, fn);
    queue = result.catch(() => {});
    return result;
}

export async function readState() {
    try {
        const raw = await fs.readFile(STATE_FILE, 'utf-8');
        return migrate(JSON.parse(raw));
    } catch (err) {
        if (err.code === 'ENOENT') return defaultState();
        throw err;
    }
}

export async function writeState(state) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TMP_FILE, JSON.stringify(state, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
    });
    await fs.rename(TMP_FILE, STATE_FILE);
}

export function updateState(mutatorFn) {
    return enqueue(async () => {
        const state = await readState();
        const next = await mutatorFn(state);
        await writeState(next);
        return next;
    });
}

/** Rewrites state.json in the current format (drops any plaintext v1 token). */
export function migrateStateFile() {
    return updateState((s) => s);
}

export async function readAccount(accountId) {
    const state = await readState();
    return state.accounts[accountId] ?? emptyAccount();
}

export function updateAccount(accountId, mutatorFn) {
    return updateState(async (state) => {
        const current = state.accounts[accountId] ?? emptyAccount();
        const next = await mutatorFn(current);
        return {
            ...state,
            accounts: { ...state.accounts, [accountId]: next },
        };
    });
}

export function encryptAuth(auth) {
    return encrypt({
        plexUserToken: auth.plexUserToken,
        server: auth.server,
    });
}

/** Decrypted `{ plexUserToken, server }` for one of an account's servers, or null. */
export function getServerAuth(account, machineId) {
    const entry = account?.servers?.[machineId];
    return entry?.authEnc ? decrypt(entry.authEnc) : null;
}

/** Decrypted auth for any one server of the account (used to identify its owner). */
export function getAnyAuth(account) {
    const entry = Object.values(account?.servers || {}).find((e) => e.authEnc);
    return entry ? decrypt(entry.authEnc) : null;
}

/** Returns the account with fresh, valid credentials stored for a server. */
export function withServerAuth(account, machineId, auth) {
    return {
        ...account,
        servers: {
            ...account.servers,
            [String(machineId)]: {
                authEnc: encryptAuth(auth),
                invalid: false,
                invalidReason: null,
                savedAt: new Date().toISOString(),
            },
        },
    };
}
