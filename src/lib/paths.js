import path from 'path';

export const DATA_DIR = path.join(process.env.DATA_DIR || process.cwd(), 'data');
