import { migrateStateFile } from './stateStore.js';
import { scopeExistingKeys } from './db.js';

/** Runs all one-off data upgrades. Safe to run on every start. */
export async function runMigrations() {
    const state = await migrateStateFile();
    for (const [accountId, account] of Object.entries(state.accounts)) {
        const keyToMachine = new Map(
            account.playlists
                .filter((p) => p.serverMachineId)
                .map((p) => [String(p.sourcePlaylistKey), p.serverMachineId])
        );
        const machineIds = Object.keys(account.servers);
        scopeExistingKeys(
            accountId,
            keyToMachine,
            machineIds.length === 1 ? machineIds[0] : null
        );
    }
}
