import fs from 'fs/promises';
import path from 'path';

export const DATA_DIR = path.join(process.env.DATA_DIR || process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const TMP_FILE = `${STATE_FILE}.tmp`;

function defaultState() {
    return {
        version: 1,
        auth: null,
        playlists: [],
    };
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
        return { ...defaultState(), ...JSON.parse(raw) };
    } catch (err) {
        if (err.code === 'ENOENT') return defaultState();
        throw err;
    }
}

export async function writeState(state) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TMP_FILE, JSON.stringify(state, null, 2), 'utf-8');
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
