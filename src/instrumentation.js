export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { assertCryptoReady } = await import('./lib/crypto.js');
        assertCryptoReady();
        const { runMigrations } = await import('./lib/migrate.js');
        await runMigrations();
        const { startAutoUpdatePoller } = await import('./lib/poller.js');
        startAutoUpdatePoller();
    }
}
