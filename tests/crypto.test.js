import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = { ...process.env };

async function freshCrypto(env = {}) {
    vi.resetModules();
    process.env = { ...originalEnv, ...env };
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    return import('@/lib/crypto.js');
}

afterEach(() => {
    process.env = { ...originalEnv };
});

describe('token encryption', () => {
    it('round-trips any JSON value', async () => {
        const { encrypt, decrypt } = await freshCrypto();
        const value = { plexUserToken: 'abc', server: { machineId: 'm', uri: 'http://x' } };
        expect(decrypt(encrypt(value))).toEqual(value);
    });

    it('never contains the plaintext and differs every time', async () => {
        const { encrypt } = await freshCrypto();
        const a = encrypt({ token: 'super-secret-token' });
        const b = encrypt({ token: 'super-secret-token' });
        expect(a).not.toContain('super-secret-token');
        expect(a).not.toBe(b);
        expect(a.startsWith('v1:')).toBe(true);
    });

    it('rejects tampered data', async () => {
        const { encrypt, decrypt } = await freshCrypto();
        const parts = encrypt({ a: 1 }).split(':');
        const flipped = Buffer.from(parts[3], 'base64');
        flipped[0] ^= 0xff;
        parts[3] = flipped.toString('base64');
        expect(() => decrypt(parts.join(':'))).toThrow();
    });

    it('cannot be read with a different key', async () => {
        const first = await freshCrypto({ TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') });
        const payload = first.encrypt({ a: 1 });
        const second = await freshCrypto({ TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') });
        expect(() => second.decrypt(payload)).toThrow();
    });

    it('rejects a malformed key', async () => {
        const { encrypt } = await freshCrypto({ TOKEN_ENCRYPTION_KEY: 'too-short' });
        expect(() => encrypt({})).toThrow(/32 bytes/);
    });
});

describe('where the key comes from', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psm-key-'));
    });

    it('reads TOKEN_ENCRYPTION_KEY_FILE', async () => {
        const keyFile = path.join(dir, 'secret');
        fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64'));
        const { encrypt, decrypt } = await freshCrypto({
            TOKEN_ENCRYPTION_KEY: undefined,
            TOKEN_ENCRYPTION_KEY_FILE: keyFile,
            DATA_DIR: dir,
        });
        expect(decrypt(encrypt({ ok: true }))).toEqual({ ok: true });
    });

    it('fails clearly when the key file is missing', async () => {
        const { encrypt } = await freshCrypto({
            TOKEN_ENCRYPTION_KEY: undefined,
            TOKEN_ENCRYPTION_KEY_FILE: path.join(dir, 'nope'),
            DATA_DIR: dir,
        });
        expect(() => encrypt({})).toThrow(/missing file/);
    });

    it('generates a key on first run, saves it, and reuses it', async () => {
        const env = { TOKEN_ENCRYPTION_KEY: undefined, TOKEN_ENCRYPTION_KEY_FILE: undefined, DATA_DIR: dir };
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const first = await freshCrypto(env);
        const payload = first.encrypt({ n: 1 });
        const keyFile = path.join(dir, 'secrets', 'encryption_key');
        expect(fs.existsSync(keyFile)).toBe(true);
        // ...and not next to the data it protects.
        expect(fs.existsSync(path.join(dir, 'data', '.encryption_key'))).toBe(false);

        // A new process (fresh module state) must read the same key back.
        const second = await freshCrypto(env);
        expect(second.decrypt(payload)).toEqual({ n: 1 });
    });

    it('keeps using a key that an earlier version saved in the data dir', async () => {
        const env = { TOKEN_ENCRYPTION_KEY: undefined, TOKEN_ENCRYPTION_KEY_FILE: undefined, DATA_DIR: dir };
        fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'data', '.encryption_key'), crypto.randomBytes(32).toString('base64'));

        const first = await freshCrypto(env);
        const payload = first.encrypt({ n: 1 });

        const second = await freshCrypto(env);
        expect(second.decrypt(payload)).toEqual({ n: 1 });
        // It must not quietly create a second key that would orphan the tokens.
        expect(fs.existsSync(path.join(dir, 'secrets', 'encryption_key'))).toBe(false);
    });

    it('prefers the env var over a key file in the data dir', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const generated = await freshCrypto({ TOKEN_ENCRYPTION_KEY: undefined, DATA_DIR: dir });
        const payload = generated.encrypt({ n: 1 });

        const explicit = await freshCrypto({
            TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
            DATA_DIR: dir,
        });
        expect(() => explicit.decrypt(payload)).toThrow();
    });
});
