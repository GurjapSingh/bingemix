export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startAutoUpdatePoller } = await import('./lib/poller.js');
        startAutoUpdatePoller();
    }
}
