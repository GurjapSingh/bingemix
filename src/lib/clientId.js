import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './stateStore';

const CLIENT_ID_FILE = path.join(DATA_DIR, 'client_id');

let cached = null;

export async function getClientId() {
    if (cached) return cached;

    try {
        cached = (await fs.readFile(CLIENT_ID_FILE, 'utf-8')).trim();
        return cached;
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    const id = crypto.randomUUID();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CLIENT_ID_FILE, id, 'utf-8');
    cached = id;
    return id;
}
