import path from 'path';

const BASE_DIR = process.env.DATA_DIR || process.cwd();

export const DATA_DIR = path.join(BASE_DIR, 'data');

// The generated encryption key lives here, apart from the data it protects, so
// a copy of the data folder (a backup, a shared drive) is useless without it.
export const SECRETS_DIR = path.join(BASE_DIR, 'secrets');
