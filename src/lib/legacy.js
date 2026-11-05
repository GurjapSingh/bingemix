import { readState, updateState, emptyAccount, getAnyAuth } from './stateStore.js';
import { getPlexUser } from './plexTv.js';
import { adoptLegacyRows } from './db.js';

let inFlight = null;

/**
 * Moves pre-multi-user data (state.legacy + db rows with account_id = '')
 * into the account that owns the legacy token. If that token is dead, the
 * account that is logging in now takes it instead.
 */
export function adoptLegacyData(activeAccountId) {
    if (!inFlight) {
        inFlight = doAdopt(activeAccountId).finally(() => {
            inFlight = null;
        });
    }
    return inFlight;
}

async function doAdopt(activeAccountId) {
    const peek = await readState();
    if (!peek.legacy) return;

    let ownerId = String(activeAccountId);
    try {
        const auth = getAnyAuth(peek.legacy);
        if (auth?.plexUserToken) {
            const user = await getPlexUser(auth.plexUserToken);
            if (user?.id) ownerId = String(user.id);
        }
    } catch (err) {
        console.warn(
            '[legacy] could not resolve legacy token owner, assigning to current account:',
            err.message
        );
    }

    let adopted = false;
    await updateState((state) => {
        if (!state.legacy) return state;
        const { legacy, ...rest } = state;
        if (!rest.accounts[ownerId]) {
            rest.accounts = {
                ...rest.accounts,
                [ownerId]: { ...emptyAccount(), ...legacy },
            };
            adopted = true;
        }
        return rest;
    });
    if (adopted) {
        const machineId = Object.keys(peek.legacy.servers || {})[0] ?? null;
        adoptLegacyRows(ownerId, machineId);
    }
    console.log(`[legacy] adopted single-user data into account ${ownerId}`);
}
