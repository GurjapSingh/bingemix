import crypto from 'crypto';
import { cookies } from 'next/headers';
import { encrypt, decrypt } from './crypto.js';
import {
    insertSession,
    getSessionRow,
    updateSessionRow,
    deleteSessionRow,
} from './db.js';

export const SESSION_COOKIE = 'plex_session';
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

function hashId(id) {
    return crypto.createHash('sha256').update(id).digest('hex');
}

function cookieOptions(secure, maxAge = SESSION_MAX_AGE_S) {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: !!secure,
        path: '/',
        maxAge,
    };
}

/** Creates a session holding the plex.tv login token and sets the cookie. */
export async function createSession(adminToken, { secure } = {}) {
    const id = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    insertSession({
        idHash: hashId(id),
        adminTokenEnc: encrypt({ token: adminToken }),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_MAX_AGE_S * 1000).toISOString(),
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, id, cookieOptions(secure));
    return { idHash: hashId(id) };
}

/**
 * Current session, decrypted, or null.
 * `token` is the active profile's token (null until a profile is chosen).
 */
export async function getSession() {
    const cookieStore = await cookies();
    const id = cookieStore.get(SESSION_COOKIE)?.value;
    if (!id) return null;

    const idHash = hashId(id);
    const row = getSessionRow(idHash);
    if (!row) return null;
    if (row.expires_at < new Date().toISOString()) {
        deleteSessionRow(idHash);
        return null;
    }

    try {
        return {
            idHash,
            accountId: row.account_id,
            profileTitle: row.profile_title,
            adminToken: decrypt(row.admin_token_enc).token,
            token: row.profile_token_enc
                ? decrypt(row.profile_token_enc).token
                : null,
            server: row.server_enc ? decrypt(row.server_enc) : null,
            library: row.library_json ? JSON.parse(row.library_json) : null,
        };
    } catch (err) {
        // Wrong/rotated encryption key or corrupt row: treat as logged out.
        console.error('[session] could not decrypt session:', err.message);
        deleteSessionRow(idHash);
        return null;
    }
}

export async function setActiveProfile(session, { accountId, title, token }) {
    // A different profile has different servers/libraries visible.
    updateSessionRow(session.idHash, {
        accountId: String(accountId),
        profileTitle: title ?? null,
        profileTokenEnc: encrypt({ token }),
        serverEnc: null,
        libraryJson: null,
    });
}

export function setSessionServer(session, server) {
    updateSessionRow(session.idHash, {
        serverEnc: server ? encrypt(server) : null,
        libraryJson: null,
    });
}

export function setSessionLibrary(session, library) {
    updateSessionRow(session.idHash, {
        libraryJson: library ? JSON.stringify(library) : null,
    });
}

export async function destroySession() {
    const cookieStore = await cookies();
    const id = cookieStore.get(SESSION_COOKIE)?.value;
    if (id) deleteSessionRow(hashId(id));
    cookieStore.delete(SESSION_COOKIE);
}

/**
 * Guard for API routes.
 *   const { session, response } = await requireSession({ server: true });
 *   if (response) return response;
 */
export async function requireSession({ server = false, library = false } = {}) {
    const session = await getSession();
    if (!session || !session.accountId || !session.token) {
        return {
            response: Response.json(
                { error: 'Not authenticated' },
                { status: 401 }
            ),
        };
    }
    if (server && !session.server) {
        return {
            response: Response.json(
                { error: 'Not connected to Plex' },
                { status: 401 }
            ),
        };
    }
    if (library && !session.library) {
        return {
            response: Response.json(
                { error: 'Missing server or library' },
                { status: 401 }
            ),
        };
    }
    return { session };
}
