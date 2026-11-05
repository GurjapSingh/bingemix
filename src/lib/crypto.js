import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './paths.js';

const VERSION = 'v1';
let cachedKey = null;

function parseKey(b64) {
    const key = Buffer.from(b64.trim(), 'base64');
    if (key.length !== 32) {
        throw new Error(
            'TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded. Generate one with: openssl rand -base64 32'
        );
    }
    return key;
}

function readKeyFile(file) {
    try {
        return parseKey(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

/**
 * Key lookup order:
 *   1. TOKEN_ENCRYPTION_KEY          (32 bytes, base64)
 *   2. TOKEN_ENCRYPTION_KEY_FILE     (path to a file holding the key, e.g. a Docker secret)
 *   3. data/.encryption_key          (generated on first run if nothing else is set)
 * Option 3 keeps the key next to the data it protects, so for anything beyond
 * a home setup prefer 1 or 2 and keep the key out of the data volume.
 */
function getKey() {
    if (cachedKey) return cachedKey;

    if (process.env.TOKEN_ENCRYPTION_KEY) {
        cachedKey = parseKey(process.env.TOKEN_ENCRYPTION_KEY);
        return cachedKey;
    }

    if (process.env.TOKEN_ENCRYPTION_KEY_FILE) {
        const key = readKeyFile(process.env.TOKEN_ENCRYPTION_KEY_FILE);
        if (!key) {
            throw new Error(
                `TOKEN_ENCRYPTION_KEY_FILE points to a missing file: ${process.env.TOKEN_ENCRYPTION_KEY_FILE}`
            );
        }
        cachedKey = key;
        return cachedKey;
    }

    const keyFile = path.join(DATA_DIR, '.encryption_key');
    // .dev_key is the name earlier dev builds used.
    const existing =
        readKeyFile(keyFile) || readKeyFile(path.join(DATA_DIR, '.dev_key'));
    if (existing) {
        cachedKey = existing;
        return cachedKey;
    }

    console.warn(
        `[crypto] No TOKEN_ENCRYPTION_KEY set; generated one at ${keyFile}. ` +
            'Back up this file (losing it means users must re-link), and for ' +
            'better security set TOKEN_ENCRYPTION_KEY or TOKEN_ENCRYPTION_KEY_FILE instead.'
    );
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, key.toString('base64'), { mode: 0o600 });
    cachedKey = key;
    return key;
}

/** Throws early if the key is missing or malformed. */
export function assertCryptoReady() {
    getKey();
}

export function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf-8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
        VERSION,
        iv.toString('base64'),
        tag.toString('base64'),
        ciphertext.toString('base64'),
    ].join(':');
}

export function decrypt(payload) {
    const [version, iv, tag, ciphertext] = String(payload).split(':');
    if (version !== VERSION || !iv || !tag || !ciphertext) {
        throw new Error('Unrecognized encrypted payload format');
    }
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getKey(),
        Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf-8'));
}
