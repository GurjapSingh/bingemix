import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './stateStore.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS episode_watch_baseline (
        playlist_key TEXT NOT NULL,
        rating_key TEXT NOT NULL,
        baseline_view_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (playlist_key, rating_key)
    );

    CREATE TABLE IF NOT EXISTS playlist_savepoints (
        playlist_key TEXT NOT NULL,
        position INTEGER NOT NULL,
        rating_key TEXT NOT NULL,
        show_title TEXT,
        season INTEGER,
        episode INTEGER,
        title TEXT,
        saved_at TEXT NOT NULL,
        PRIMARY KEY (playlist_key, position)
    );
`);

const setBaselineStmt = db.prepare(`
    INSERT INTO episode_watch_baseline (playlist_key, rating_key, baseline_view_count, created_at)
    VALUES (@playlistKey, @ratingKey, @viewCount, @createdAt)
    ON CONFLICT (playlist_key, rating_key) DO UPDATE SET
        baseline_view_count = excluded.baseline_view_count,
        created_at = excluded.created_at
`);

const getBaselinesStmt = db.prepare(`
    SELECT rating_key, baseline_view_count FROM episode_watch_baseline WHERE playlist_key = ?
`);

const deleteBaselineStmt = db.prepare(`
    DELETE FROM episode_watch_baseline WHERE playlist_key = ? AND rating_key = ?
`);

const deleteBaselinesForPlaylistStmt = db.prepare(`
    DELETE FROM episode_watch_baseline WHERE playlist_key = ?
`);

export function setBaseline(playlistKey, ratingKey, viewCount) {
    setBaselineStmt.run({
        playlistKey: String(playlistKey),
        ratingKey: String(ratingKey),
        viewCount,
        createdAt: new Date().toISOString(),
    });
}

export function getBaselines(playlistKey) {
    const rows = getBaselinesStmt.all(String(playlistKey));
    return new Map(rows.map((r) => [r.rating_key, r.baseline_view_count]));
}

export function deleteBaseline(playlistKey, ratingKey) {
    deleteBaselineStmt.run(String(playlistKey), String(ratingKey));
}

export function deleteBaselinesForPlaylist(playlistKey) {
    deleteBaselinesForPlaylistStmt.run(String(playlistKey));
}

const clearSavepointStmt = db.prepare(`
    DELETE FROM playlist_savepoints WHERE playlist_key = ?
`);

const insertSavepointItemStmt = db.prepare(`
    INSERT INTO playlist_savepoints (playlist_key, position, rating_key, show_title, season, episode, title, saved_at)
    VALUES (@playlistKey, @position, @ratingKey, @showTitle, @season, @episode, @title, @savedAt)
`);

const getSavepointStmt = db.prepare(`
    SELECT position, rating_key, show_title, season, episode, title, saved_at
    FROM playlist_savepoints
    WHERE playlist_key = ?
    ORDER BY position ASC
`);

export const saveSavepoint = db.transaction((playlistKey, items) => {
    clearSavepointStmt.run(String(playlistKey));
    const savedAt = new Date().toISOString();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        insertSavepointItemStmt.run({
            playlistKey: String(playlistKey),
            position: i,
            ratingKey: String(item.ratingKey),
            showTitle: item.showTitle ?? null,
            season: item.season ?? null,
            episode: item.episode ?? null,
            title: item.title ?? null,
            savedAt,
        });
    }
});

export function getSavepoint(playlistKey) {
    return getSavepointStmt.all(String(playlistKey));
}

export function clearSavepoint(playlistKey) {
    clearSavepointStmt.run(String(playlistKey));
}
