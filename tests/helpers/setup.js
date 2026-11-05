import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

// Isolated data dir + encryption key for every test file. Must run before any
// app module is imported (they read these at import time).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'psm-test-'));
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.INSTANCE_NAME = 'test-host';
