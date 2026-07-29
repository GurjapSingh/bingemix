import { reconcileAll } from './reconcile.js';

const BASE_INTERVAL_MS =
    Number(process.env.AUTO_UPDATE_POLL_INTERVAL_MS) || 5 * 60 * 1000;
const MAX_BACKOFF_MS =
    Number(process.env.AUTO_UPDATE_MAX_BACKOFF_MS) || 30 * 60 * 1000;

let failureStreak = 0;

async function tick() {
    try {
        await reconcileAll();
        failureStreak = 0;
    } catch (err) {
        failureStreak++;
        console.error('[auto-update] poll failed', err);
    }
    const delay =
        failureStreak === 0
            ? BASE_INTERVAL_MS
            : Math.min(BASE_INTERVAL_MS * 2 ** failureStreak, MAX_BACKOFF_MS);
    setTimeout(tick, delay);
}

export function startAutoUpdatePoller() {
    if (globalThis.__autoUpdatePollerStarted) return;
    globalThis.__autoUpdatePollerStarted = true;
    setTimeout(tick, 10_000);
}
