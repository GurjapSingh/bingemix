import {
    readState,
    readAccount,
    updateAccount,
    getServerAuth,
} from './stateStore.js';
import {
    getPlaylistItems,
    removePlaylistItem,
    PlexApiError,
} from './plexClient.js';
import {
    scopedKey,
    getBaselines,
    setBaseline,
    deleteBaseline,
    deleteBaselinesForPlaylist,
} from './db.js';
import { refreshMarker, MARKER_REFRESH_MS } from './marker.js';

function formatEpisode(item) {
    const season = item.parentIndex != null ? String(item.parentIndex).padStart(2, '0') : '??';
    const episode = item.index != null ? String(item.index).padStart(2, '0') : '??';
    return `${item.grandparentTitle || item.title} S${season}E${episode}`;
}

export async function reconcilePlaylistEntry(accountId, entry, server) {
    console.log(`[auto-update] checking "${entry.title}"`);

    const dbKey = scopedKey(entry.serverMachineId, entry.sourcePlaylistKey);
    const items = await getPlaylistItems(server, entry.sourcePlaylistKey);
    const baselines = getBaselines(accountId, dbKey);

    const watched = [];
    for (const item of items) {
        const ratingKey = String(item.ratingKey);
        const viewCount = item.viewCount ?? 0;
        const baseline = baselines.get(ratingKey);
        if (baseline === undefined) {
            // No baseline — seed it so a future watch is detected, skip this pass.
            setBaseline(accountId, dbKey, ratingKey, viewCount);
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

    for (const item of watched) {
        await removePlaylistItem(server, entry.sourcePlaylistKey, item.playlistItemID);
        deleteBaseline(accountId, dbKey, item.ratingKey);
    }

    const episodeList = watched.map(formatEpisode).join(', ');
    console.log(`[auto-update] "${entry.title}": removed ${watched.length} watched episode(s): ${episodeList}`);

    return {
        status: 'active',
        lastPolledAt: new Date().toISOString(),
        lastError: null,
    };
}

function patchPlaylist(accountId, id, patch) {
    return updateAccount(accountId, (account) => ({
        ...account,
        playlists: account.playlists.map((p) =>
            p.id === id
                ? { ...p, ...patch, updatedAt: new Date().toISOString() }
                : p
        ),
    }));
}

async function runAccount(accountId) {
    const account = await readAccount(accountId);

    // Group by server: each playlist is checked against the server it lives on.
    const byServer = new Map();
    for (const entry of account.playlists.filter((p) => p.enabled)) {
        if (!entry.serverMachineId) continue;
        if (!byServer.has(entry.serverMachineId)) {
            byServer.set(entry.serverMachineId, []);
        }
        byServer.get(entry.serverMachineId).push(entry);
    }

    let failure = null;
    for (const [machineId, entries] of byServer) {
        const serverState = account.servers[machineId];
        if (!serverState || serverState.invalid) continue;
        const auth = getServerAuth(account, machineId);
        if (!auth) continue;

        for (const entry of entries) {
            try {
                const result = await reconcilePlaylistEntry(
                    accountId,
                    entry,
                    auth.server
                );
                const patch = { ...result };

                // Keep the "auto-updated by" note in Plex fresh (hourly).
                const due =
                    !entry.markerAt ||
                    Date.now() - new Date(entry.markerAt).getTime() > MARKER_REFRESH_MS;
                if (due) {
                    try {
                        const outcome = await refreshMarker(
                            auth.server,
                            entry.sourcePlaylistKey
                        );
                        if (outcome === 'written') {
                            patch.markerAt = new Date().toISOString();
                        }
                    } catch (markerErr) {
                        console.warn('[auto-update] marker refresh failed:', markerErr.message);
                    }
                }
                await patchPlaylist(accountId, entry.id, patch);
            } catch (err) {
                if (err instanceof PlexApiError && err.status === 401) {
                    // Only this server's credentials are bad; others keep running.
                    await updateAccount(accountId, (a) => ({
                        ...a,
                        servers: {
                            ...a.servers,
                            [machineId]: {
                                ...a.servers[machineId],
                                invalid: true,
                                invalidReason: 'Plex token rejected (401)',
                            },
                        },
                    }));
                    failure = err;
                    break;
                }
                if (err instanceof PlexApiError && err.status === 404) {
                    deleteBaselinesForPlaylist(
                        accountId,
                        scopedKey(machineId, entry.sourcePlaylistKey)
                    );
                    await patchPlaylist(accountId, entry.id, {
                        status: 'missing',
                        enabled: false,
                        lastError: 'Playlist not found in Plex (deleted?)',
                    });
                    continue;
                }
                await patchPlaylist(accountId, entry.id, {
                    lastError: String(err.message || err),
                });
            }
        }
    }
    if (failure) throw failure;
}

const running = new Map();

/** Reconciles one account's enabled playlists (never overlaps with itself). */
export function reconcileAccount(accountId) {
    const key = String(accountId);
    if (running.has(key)) return running.get(key);
    const promise = runAccount(key).finally(() => running.delete(key));
    running.set(key, promise);
    return promise;
}

/**
 * Reconciles every account. One account failing never stops the others;
 * throws only if every account with work to do failed (drives poller backoff).
 */
export async function reconcileAll() {
    const state = await readState();
    const ids = Object.keys(state.accounts);

    let attempted = 0;
    let failed = 0;
    let lastError = null;
    for (const accountId of ids) {
        const account = state.accounts[accountId];
        const hasWork = account.playlists.some(
            (p) =>
                p.enabled &&
                p.serverMachineId &&
                account.servers[p.serverMachineId] &&
                !account.servers[p.serverMachineId].invalid
        );
        if (!hasWork) continue;
        attempted++;
        try {
            await reconcileAccount(accountId);
        } catch (err) {
            failed++;
            lastError = err;
            console.error(`[auto-update] account ${accountId} failed:`, err.message);
        }
    }
    if (attempted > 0 && failed === attempted) throw lastError;
}
