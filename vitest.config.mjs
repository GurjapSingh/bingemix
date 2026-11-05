import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        setupFiles: ['tests/helpers/setup.js'],
        // Each test file gets its own module registry, data dir and database.
    },
});
