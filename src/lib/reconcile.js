import { readState, updateState } from './stateStore.js';
import {
    getPlaylist,
    getPlaylistItems,
    findPlaylistByTitle,
    createPlaylist,
    addItemsToPlaylist,
    removePlaylistItem,
    PlexApiError,
} from './plexClient.js';
import {
    getBaselines,
    setBaseline,
    deleteBaseline,
    deleteBaselinesForPlaylist,
} from './db.js';

function formatEpisode(item) {
    const season = item.parentIndex != null ? String(item.parentIndex).padStart(2, '0') : '??';
    const episode = item.index != null ? String(item.index).padStart(2, '0') : '??';
    return `${item.grandparentTitle || item.title} S${season}E${episode}`;
}

async function resolveWatchedPlaylistKey(entry, server) {
    if (entry.watchedPlaylistKey) {
        try {
            await getPlaylist(server, entry.watchedPlaylistKey);
            return entry.watchedPlaylistKey;
        } catch (err) {
            if (err.status !== 404) throw err;
        }
    }
    const found = await findPlaylistByTitle(server, entry.watchedPlaylistTitle);
    return found?.ratingKey || null;
}

export async function reconcilePlaylistEntry(entry, server) {
    console.log(`[auto-update] checking "${entry.title}"`);

    const items = await getPlaylistItems(server, entry.sourcePlaylistKey);
    const baselines = getBaselines(entry.sourcePlaylistKey);

    const watched = [];
    for (const item of items) {
        const ratingKey = String(item.ratingKey);
        const viewCount = item.viewCount ?? 0;
        const baseline = baselines.get(ratingKey);
        if (baseline === undefined) {
            // No baseline recorded (playlist predates this feature, or the item
            // was added outside the mixer flow) — seed it now so a future watch
            // is detected, without removing anything on this pass.
            setBaseline(entry.sourcePlaylistKey, ratingKey, viewCount);
            continue;
        }
        if (viewCount > baseline) {
            watched.push(item);
        }
    }

    if (watched.length === 0) {
        console.log(`[auto-update] "${entry.title}": no watched episodes, nothing to do`);
        return { status: 'active', lastPolledAt: new Date().toISOString(), lastError: null };
    }

    let watchedPlaylistKey = await resolveWatchedPlaylistKey(entry, server);

    let existingWatchedKeys = new Set();
    if (watchedPlaylistKey) {
        const watchedItems = await getPlaylistItems(server, watchedPlaylistKey);
        existingWatchedKeys = new Set(watchedItems.map((i) => i.ratingKey));
    }

    const toAdd = watched.filter((i) => !existingWatchedKeys.has(i.ratingKey));

    if (toAdd.length > 0) {
        if (!watchedPlaylistKey) {
            watchedPlaylistKey = await createPlaylist(
                server,
                entry.watchedPlaylistTitle,
                toAdd[0].ratingKey
            );
            const rest = toAdd.slice(1).map((i) => i.ratingKey);
            if (rest.length > 0) {
                await addItemsToPlaylist(server, watchedPlaylistKey, rest);
            }
        } else {
            await addItemsToPlaylist(
                server,
                watchedPlaylistKey,
                toAdd.map((i) => i.ratingKey)
            );
        }
    }

    for (const item of watched) {
        await removePlaylistItem(server, entry.sourcePlaylistKey, item.playlistItemID);
        deleteBaseline(entry.sourcePlaylistKey, item.ratingKey);
    }

    const episodeList = watched.map(formatEpisode).join(', ');
    console.log(
        `[auto-update] "${entry.title}": moved ${watched.length} watched episode(s) to "${entry.watchedPlaylistTitle}": ${episodeList}`
    );

    return {
        status: 'active',
        watchedPlaylistKey,
        lastPolledAt: new Date().toISOString(),
        lastError: null,
    };
}

export async function reconcileAll() {
    const state = await readState();
    if (!state.auth || state.auth.invalid) return;

    for (const entry of state.playlists.filter((p) => p.enabled)) {
        try {
            const result = await reconcilePlaylistEntry(entry, state.auth.server);
            await updateState((s) => ({
                ...s,
                playlists: s.playlists.map((p) =>
                    p.id === entry.id
                        ? { ...p, ...result, updatedAt: new Date().toISOString() }
                        : p
                ),
            }));
        } catch (err) {
            if (err instanceof PlexApiError && err.status === 401) {
                await updateState((s) => ({
                    ...s,
                    auth: {
                        ...s.auth,
                        invalid: true,
                        invalidReason: 'Plex token rejected (401)',
                    },
                }));
                throw err;
            }
            if (err instanceof PlexApiError && err.status === 404) {
                deleteBaselinesForPlaylist(entry.sourcePlaylistKey);
                await updateState((s) => ({
                    ...s,
                    playlists: s.playlists.map((p) =>
                        p.id === entry.id
                            ? {
                                  ...p,
                                  status: 'missing',
                                  enabled: false,
                                  lastError: 'Playlist not found in Plex (deleted?)',
                                  updatedAt: new Date().toISOString(),
                              }
                            : p
                    ),
                }));
                continue;
            }
            await updateState((s) => ({
                ...s,
                playlists: s.playlists.map((p) =>
                    p.id === entry.id
                        ? {
                              ...p,
                              lastError: String(err.message || err),
                              updatedAt: new Date().toISOString(),
                          }
                        : p
                ),
            }));
        }
    }
}
