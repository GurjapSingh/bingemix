import { getClientId } from './clientId.js';

async function plexTvFetch(url, token, options = {}) {
    const clientId = await getClientId();
    const res = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/json',
            'X-Plex-Product': 'Plex Show Mixer',
            'X-Plex-Version': '1.0',
            'X-Plex-Platform': 'Web',
            'X-Plex-Client-Identifier': clientId,
            'X-Plex-Token': token,
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const err = new Error(`plex.tv request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

/** The account a token belongs to: { id, uuid, title, ... }. */
export async function getPlexUser(token) {
    return plexTvFetch('https://plex.tv/api/v2/user', token);
}

/**
 * Plex Home members for the account that owns `token`.
 * Returns [] when the account has no Home or the lookup fails.
 */
export async function getHomeUsers(token) {
    try {
        const data = await plexTvFetch(
            'https://plex.tv/api/v2/home/users',
            token
        );
        const users = Array.isArray(data) ? data : data?.users || [];
        return users.map((u) => ({
            id: String(u.id),
            uuid: u.uuid,
            title: u.title || u.username || u.friendlyName || 'Unknown',
            thumb: u.thumb || null,
            protected: !!u.protected,
            admin: !!u.admin,
        }));
    } catch (err) {
        console.warn('[plexTv] home users lookup failed:', err.message);
        return [];
    }
}

/** Exchanges the Home admin's token for a profile's own token. */
export async function switchHomeUser(adminToken, uuid, pin) {
    const url = new URL(
        `https://plex.tv/api/v2/home/users/${encodeURIComponent(uuid)}/switch`
    );
    if (pin) url.searchParams.set('pin', pin);
    const data = await plexTvFetch(url, adminToken, { method: 'POST' });
    if (!data?.authToken) throw new Error('Plex did not return a token');
    return data.authToken;
}

/** All server resources visible to `token`. */
export async function getServerResources(token) {
    const data = await plexTvFetch(
        'https://plex.tv/api/v2/resources',
        token
    );
    return (data || []).filter((r) => r.provides?.includes('server'));
}
