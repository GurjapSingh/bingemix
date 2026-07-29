export class PlexApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PlexApiError';
        this.status = status;
    }
}

async function plexFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) {
        const details = await res.text().catch(() => '');
        throw new PlexApiError(
            `Plex API request failed (${res.status}): ${details}`,
            res.status
        );
    }
    if (res.status === 204) return null;
    return res.json();
}

export async function listPlaylists(server) {
    const url = new URL('/playlists', server.uri);
    url.searchParams.set('X-Plex-Token', server.accessToken);
    const data = await plexFetch(url);
    const items = data?.MediaContainer?.Metadata || [];
    return items.filter(
        (p) => p.playlistType === 'video' && p.smart !== true
    );
}

export async function findPlaylistByTitle(server, title) {
    const playlists = await listPlaylists(server);
    return playlists.find((p) => p.title === title) || null;
}

export async function getPlaylist(server, playlistKey) {
    const url = new URL(`/playlists/${playlistKey}`, server.uri);
    url.searchParams.set('X-Plex-Token', server.accessToken);
    const data = await plexFetch(url);
    return data?.MediaContainer?.Metadata?.[0] || null;
}

export async function getPlaylistItems(server, playlistKey) {
    const url = new URL(`/playlists/${playlistKey}/items`, server.uri);
    url.searchParams.set('X-Plex-Token', server.accessToken);
    const data = await plexFetch(url);
    return data?.MediaContainer?.Metadata || [];
}

export async function getItemsMetadata(server, ratingKeys) {
    const url = new URL(`/library/metadata/${ratingKeys.join(',')}`, server.uri);
    url.searchParams.set('X-Plex-Token', server.accessToken);
    const data = await plexFetch(url);
    return data?.MediaContainer?.Metadata || [];
}

export async function createPlaylist(server, title, seedRatingKey) {
    const url = new URL('/playlists', server.uri);
    url.searchParams.set('type', 'video');
    url.searchParams.set('title', title);
    url.searchParams.set('smart', '0');
    url.searchParams.set('X-Plex-Token', server.accessToken);
    url.searchParams.append('uri', `/library/metadata/${seedRatingKey}`);
    const data = await plexFetch(url, { method: 'POST' });
    const playlistKey = data?.MediaContainer?.Metadata?.[0]?.ratingKey;
    if (!playlistKey) {
        throw new PlexApiError('No playlist key returned on create', 502);
    }
    return playlistKey;
}

export async function addItemsToPlaylist(server, playlistKey, ratingKeys) {
    const chunkSize = 100;
    for (let i = 0; i < ratingKeys.length; i += chunkSize) {
        const chunk = ratingKeys.slice(i, i + chunkSize).join(',');
        const chunkPrefix = `server://${server.machineId}/com.plexapp.plugins.library/library/metadata/`;
        const url = new URL(`/playlists/${playlistKey}/items`, server.uri);
        url.searchParams.set('uri', chunkPrefix + chunk);
        url.searchParams.set('X-Plex-Token', server.accessToken);
        await plexFetch(url, { method: 'PUT' });
    }
}

export async function removePlaylistItem(server, playlistKey, playlistItemID) {
    const url = new URL(
        `/playlists/${playlistKey}/items/${playlistItemID}`,
        server.uri
    );
    url.searchParams.set('X-Plex-Token', server.accessToken);
    try {
        await plexFetch(url, { method: 'DELETE' });
    } catch (err) {
        if (err.status === 404) return; // already removed - idempotent
        throw err;
    }
}

export async function movePlaylistItem(
    server,
    playlistKey,
    playlistItemID,
    afterPlaylistItemID
) {
    const url = new URL(
        `/playlists/${playlistKey}/items/${playlistItemID}/move`,
        server.uri
    );
    if (afterPlaylistItemID) {
        url.searchParams.set('after', afterPlaylistItemID);
    }
    url.searchParams.set('X-Plex-Token', server.accessToken);
    await plexFetch(url, { method: 'PUT' });
}
