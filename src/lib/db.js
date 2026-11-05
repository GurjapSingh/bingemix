import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './paths.js';

// `next build` loads every route in several worker processes just to collect
// page data. They must not all try to create/migrate the real database file at
// once (SQLITE_BUSY), and a build shouldn't touch real data anyway, so use a
// throwaway in-memory database during the build.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuild) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(isBuild ? ':memory:' : path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

// ---------------------------------------------------------------------------
// Schema + migration.
// Rows used to be keyed only by playlist_key. They are now scoped by
// account_id. Legacy rows get account_id = '' and are claimed later by
// adoptLegacyRows() when their owner logs in.
// ---------------------------------------------------------------------------

const BASELINE_COLUMNS =
    'playlist_key, rating_key, baseline_view_count, created_at';
const SAVEPOINT_COLUMNS =
    'playlist_key, position, rating_key, show_title, season, episode, title, saved_at';

function tableExists(name) {
    return !!db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
        .get(name);
}

function hasColumn(table, column) {
    return db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((c) => c.name === column);
}

function ensureAccountScopedTable(name, createSql, columns) {
    const needsRebuild = tableExists(name) && !hasColumn(name, 'account_id');
    if (needsRebuild) db.exec(`ALTER TABLE ${name} RENAME TO ${name}_old`);
    db.exec(createSql);
    if (needsRebuild) {
        db.exec(
            `INSERT INTO ${name} (account_id, ${columns})
             SELECT '', ${columns} FROM ${name}_old`
        );
        db.exec(`DROP TABLE ${name}_old`);
    }
}

db.transaction(() => {
    ensureAccountScopedTable(
        'episode_watch_baseline',
        `CREATE TABLE IF NOT EXISTS episode_watch_baseline (
            account_id TEXT NOT NULL,
            playlist_key TEXT NOT NULL,
            rating_key TEXT NOT NULL,
            baseline_view_count INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (account_id, playlist_key, rating_key)
        )`,
        BASELINE_COLUMNS
    );

    ensureAccountScopedTable(
        'playlist_savepoints',
        `CREATE TABLE IF NOT EXISTS playlist_savepoints (
            account_id TEXT NOT NULL,
            playlist_key TEXT NOT NULL,
            position INTEGER NOT NULL,
            rating_key TEXT NOT NULL,
            show_title TEXT,
            season INTEGER,
            episode INTEGER,
            title TEXT,
            saved_at TEXT NOT NULL,
            PRIMARY KEY (account_id, playlist_key, position)
        )`,
        SAVEPOINT_COLUMNS
    );

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id_hash TEXT PRIMARY KEY,
            account_id TEXT,
            profile_title TEXT,
            admin_token_enc TEXT NOT NULL,
            profile_token_enc TEXT,
            server_enc TEXT,
            library_json TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    `);
})();

// ---------------------------------------------------------------------------
// Legacy adoption
// ---------------------------------------------------------------------------

/**
 * Plex ratingKeys are only unique within one server, so every playlist key
 * stored in this database is prefixed with the server's machine id.
 */
export function scopedKey(machineId, playlistKey) {
    return `${machineId}:${playlistKey}`;
}

const KEYED_TABLES = ['episode_watch_baseline', 'playlist_savepoints'];

export const adoptLegacyRows = db.transaction((accountId, machineId) => {
    for (const table of KEYED_TABLES) {
        db.prepare(
            machineId
                ? `UPDATE OR IGNORE ${table}
                   SET account_id = ?, playlist_key = ? || ':' || playlist_key
                   WHERE account_id = ''`
                : `UPDATE OR IGNORE ${table} SET account_id = ? WHERE account_id = ''`
        ).run(...(machineId ? [String(accountId), String(machineId)] : [String(accountId)]));
        db.prepare(`DELETE FROM ${table} WHERE account_id = ''`).run();
    }
});

/**
 * One-off upgrade: prefix un-scoped playlist keys for an account with the
 * server they belong to. `keyToMachine` maps a plain playlist key to a machine
 * id; `fallbackMachineId` covers keys not in the map (when the account only
 * ever used one server).
 */
export const scopeExistingKeys = db.transaction(
    (accountId, keyToMachine, fallbackMachineId) => {
        for (const table of KEYED_TABLES) {
            const keys = db
                .prepare(
                    `SELECT DISTINCT playlist_key FROM ${table}
                     WHERE account_id = ? AND playlist_key NOT LIKE '%:%'`
                )
                .all(String(accountId))
                .map((r) => r.playlist_key);
            for (const key of keys) {
                const machineId = keyToMachine.get(key) ?? fallbackMachineId;
                if (!machineId) continue;
                db.prepare(
                    `UPDATE OR IGNORE ${table} SET playlist_key = ?
                     WHERE account_id = ? AND playlist_key = ?`
                ).run(scopedKey(machineId, key), String(accountId), key);
            }
        }
    }
);

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

const setBaselineStmt = db.prepare(`
    INSERT INTO episode_watch_baseline (account_id, playlist_key, rating_key, baseline_view_count, created_at)
    VALUES (@accountId, @playlistKey, @ratingKey, @viewCount, @createdAt)
    ON CONFLICT (account_id, playlist_key, rating_key) DO UPDATE SET
        baseline_view_count = excluded.baseline_view_count,
        created_at = excluded.created_at
`);

const getBaselinesStmt = db.prepare(`
    SELECT rating_key, baseline_view_count FROM episode_watch_baseline
    WHERE account_id = ? AND playlist_key = ?
`);

const deleteBaselineStmt = db.prepare(`
    DELETE FROM episode_watch_baseline
    WHERE account_id = ? AND playlist_key = ? AND rating_key = ?
`);

const deleteBaselinesForPlaylistStmt = db.prepare(`
    DELETE FROM episode_watch_baseline WHERE account_id = ? AND playlist_key = ?
`);

export function setBaseline(accountId, playlistKey, ratingKey, viewCount) {
    setBaselineStmt.run({
        accountId: String(accountId),
        playlistKey: String(playlistKey),
        ratingKey: String(ratingKey),
        viewCount,
        createdAt: new Date().toISOString(),
    });
}

export function getBaselines(accountId, playlistKey) {
    const rows = getBaselinesStmt.all(String(accountId), String(playlistKey));
    return new Map(rows.map((r) => [r.rating_key, r.baseline_view_count]));
}

export function deleteBaseline(accountId, playlistKey, ratingKey) {
    deleteBaselineStmt.run(
        String(accountId),
        String(playlistKey),
        String(ratingKey)
    );
}

export function deleteBaselinesForPlaylist(accountId, playlistKey) {
    deleteBaselinesForPlaylistStmt.run(
        String(accountId),
        String(playlistKey)
    );
}

// ---------------------------------------------------------------------------
// Savepoints
// ---------------------------------------------------------------------------

const clearSavepointStmt = db.prepare(`
    DELETE FROM playlist_savepoints WHERE account_id = ? AND playlist_key = ?
`);

const insertSavepointItemStmt = db.prepare(`
    INSERT INTO playlist_savepoints (account_id, playlist_key, position, rating_key, show_title, season, episode, title, saved_at)
    VALUES (@accountId, @playlistKey, @position, @ratingKey, @showTitle, @season, @episode, @title, @savedAt)
`);

const getSavepointStmt = db.prepare(`
    SELECT position, rating_key, show_title, season, episode, title, saved_at
    FROM playlist_savepoints
    WHERE account_id = ? AND playlist_key = ?
    ORDER BY position ASC
`);

export const saveSavepoint = db.transaction((accountId, playlistKey, items) => {
    clearSavepointStmt.run(String(accountId), String(playlistKey));
    const savedAt = new Date().toISOString();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        insertSavepointItemStmt.run({
            accountId: String(accountId),
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

export function getSavepoint(accountId, playlistKey) {
    return getSavepointStmt.all(String(accountId), String(playlistKey));
}

export function clearSavepoint(accountId, playlistKey) {
    clearSavepointStmt.run(String(accountId), String(playlistKey));
}

// ---------------------------------------------------------------------------
// Sessions (values in *_enc columns are already encrypted by session.js)
// ---------------------------------------------------------------------------

const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (id_hash, admin_token_enc, created_at, expires_at)
    VALUES (@idHash, @adminTokenEnc, @createdAt, @expiresAt)
`);
const getSessionStmt = db.prepare(`SELECT * FROM sessions WHERE id_hash = ?`);
const deleteSessionStmt = db.prepare(`DELETE FROM sessions WHERE id_hash = ?`);
const purgeSessionsStmt = db.prepare(`DELETE FROM sessions WHERE expires_at < ?`);

const SESSION_UPDATE_COLUMNS = {
    accountId: 'account_id',
    profileTitle: 'profile_title',
    profileTokenEnc: 'profile_token_enc',
    serverEnc: 'server_enc',
    libraryJson: 'library_json',
};

export function insertSession(row) {
    purgeSessionsStmt.run(new Date().toISOString());
    insertSessionStmt.run(row);
}

export function getSessionRow(idHash) {
    return getSessionStmt.get(idHash) ?? null;
}

export function updateSessionRow(idHash, fields) {
    const sets = [];
    const params = { idHash };
    for (const [key, column] of Object.entries(SESSION_UPDATE_COLUMNS)) {
        if (key in fields) {
            sets.push(`${column} = @${key}`);
            params[key] = fields[key];
        }
    }
    if (sets.length === 0) return;
    db.prepare(
        `UPDATE sessions SET ${sets.join(', ')} WHERE id_hash = @idHash`
    ).run(params);
}

export function deleteSessionRow(idHash) {
    deleteSessionStmt.run(idHash);
}
