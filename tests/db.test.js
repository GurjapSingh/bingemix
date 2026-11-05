import { describe, it, expect } from 'vitest';
import {
    scopedKey,
    setBaseline,
    getBaselines,
    deleteBaseline,
    deleteBaselinesForPlaylist,
    saveSavepoint,
    getSavepoint,
    clearSavepoint,
    adoptLegacyRows,
    scopeExistingKeys,
} from '@/lib/db.js';

const ep = (n) => ({ ratingKey: String(n), showTitle: 'Show', season: 1, episode: n, title: `Ep ${n}` });

describe('watch baselines', () => {
    it('are private to an account', () => {
        setBaseline('alice', 'srv:1', '100', 3);
        expect(getBaselines('alice', 'srv:1').get('100')).toBe(3);
        expect(getBaselines('bob', 'srv:1').size).toBe(0);
    });

    it('the same playlist id on two servers does not collide', () => {
        setBaseline('acct', scopedKey('home', '777'), '1', 1);
        setBaseline('acct', scopedKey('cabin', '777'), '1', 9);
        expect(getBaselines('acct', scopedKey('home', '777')).get('1')).toBe(1);
        expect(getBaselines('acct', scopedKey('cabin', '777')).get('1')).toBe(9);

        deleteBaselinesForPlaylist('acct', scopedKey('home', '777'));
        expect(getBaselines('acct', scopedKey('home', '777')).size).toBe(0);
        expect(getBaselines('acct', scopedKey('cabin', '777')).size).toBe(1);
    });

    it('updates in place and deletes one at a time', () => {
        setBaseline('a', 'k', '1', 1);
        setBaseline('a', 'k', '1', 5);
        setBaseline('a', 'k', '2', 2);
        expect(getBaselines('a', 'k').get('1')).toBe(5);
        deleteBaseline('a', 'k', '1');
        expect([...getBaselines('a', 'k').keys()]).toEqual(['2']);
    });
});

describe('save points', () => {
    it('keep order and are scoped by account and server', () => {
        saveSavepoint('a', scopedKey('home', '5'), [ep(3), ep(1), ep(2)]);
        saveSavepoint('b', scopedKey('home', '5'), [ep(9)]);
        saveSavepoint('a', scopedKey('cabin', '5'), [ep(7)]);

        expect(getSavepoint('a', scopedKey('home', '5')).map((r) => r.rating_key)).toEqual(['3', '1', '2']);
        expect(getSavepoint('b', scopedKey('home', '5')).map((r) => r.rating_key)).toEqual(['9']);
        expect(getSavepoint('a', scopedKey('cabin', '5')).map((r) => r.rating_key)).toEqual(['7']);
    });

    it('saving again replaces, clearing removes only that one', () => {
        saveSavepoint('a', 'k', [ep(1), ep(2)]);
        saveSavepoint('a', 'k', [ep(3)]);
        expect(getSavepoint('a', 'k')).toHaveLength(1);
        saveSavepoint('a', 'other', [ep(4)]);
        clearSavepoint('a', 'k');
        expect(getSavepoint('a', 'k')).toHaveLength(0);
        expect(getSavepoint('a', 'other')).toHaveLength(1);
    });
});

describe('upgrading old rows', () => {
    it('adoptLegacyRows gives unowned rows to an account and scopes their keys to the server', () => {
        // Old rows have account_id '' and a bare playlist id.
        setBaseline('', '42', '1', 1);
        saveSavepoint('', '42', [ep(1)]);

        adoptLegacyRows('owner', 'home');

        expect(getBaselines('owner', scopedKey('home', '42')).get('1')).toBe(1);
        expect(getSavepoint('owner', scopedKey('home', '42'))).toHaveLength(1);
        expect(getBaselines('', '42').size).toBe(0);
    });

    it('scopeExistingKeys prefixes bare keys using the playlist->server map', () => {
        setBaseline('acct2', '10', '1', 1);
        setBaseline('acct2', '11', '1', 1);
        setBaseline('acct2', scopedKey('home', '12'), '1', 1); // already scoped

        scopeExistingKeys('acct2', new Map([['10', 'cabin']]), 'home');

        expect(getBaselines('acct2', scopedKey('cabin', '10')).size).toBe(1); // from the map
        expect(getBaselines('acct2', scopedKey('home', '11')).size).toBe(1); // from the fallback
        expect(getBaselines('acct2', scopedKey('home', '12')).size).toBe(1); // untouched
        expect(getBaselines('acct2', '10').size).toBe(0);
    });

    it('scopeExistingKeys leaves keys alone when it cannot tell the server', () => {
        setBaseline('acct3', '99', '1', 1);
        scopeExistingKeys('acct3', new Map(), null);
        expect(getBaselines('acct3', '99').size).toBe(1);
    });
});
