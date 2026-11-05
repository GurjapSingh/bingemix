export function formatAirDate(value) {
    if (!value) return '—';
    // Plex gives YYYY-MM-DD; parse as local time so the day doesn't shift.
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function formatRuntime(ms) {
    if (!ms) return '—';
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatRating(rating) {
    if (rating == null) return '—';
    return `★ ${Number(rating).toFixed(1)}`;
}
