'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatRuntime } from './episodeFormat';
import { useSortSensors, lockY } from './dnd';
import { runWithProgress } from './progress';

const STAGE_LABELS = {
    creating: 'Creating playlist…',
    removing: 'Clearing the old episodes…',
    adding: 'Adding episodes…',
    finishing: 'Finishing up…',
};

// One playlist row that can be dragged up/down by its handle.
function SortableRow({ id, disabled, children }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });
    return (
        <tr
            ref={setNodeRef}
            style={{
                transform: CSS.Translate.toString(transform),
                transition,
                position: 'relative',
                zIndex: isDragging ? 2 : undefined,
                background: isDragging ? 'var(--surface-2)' : undefined,
                boxShadow: isDragging ? 'var(--shadow)' : undefined,
            }}
        >
            <td className="w-8 px-2 py-2">
                <button
                    type="button"
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    aria-label="Drag to reorder"
                    title={disabled ? 'Locked while saving' : 'Drag to reorder'}
                    disabled={disabled}
                    className="drag-handle"
                >
                    ⠿
                </button>
            </td>
            {children}
        </tr>
    );
}

function buildRoundRobinPlaylist(showsAndEpisodes) {
    const pointers = new Map(showsAndEpisodes.map((s) => [s.ratingKey, 0]));
    const mixedEpisodes = [];

    let keepGoing = true;
    while (keepGoing) {
        keepGoing = false;
        for (const show of showsAndEpisodes) {
            const showPointer = pointers.get(show.ratingKey);
            if (showPointer < show.episodes.length) {
                const ep = show.episodes[showPointer];
                mixedEpisodes.push({ ...ep, showTitle: show.title, showRatingKey: show.ratingKey });
                pointers.set(show.ratingKey, showPointer + 1);
                keepGoing = true;
            }
        }
    }
    return mixedEpisodes;
}

// Small seeded PRNG so the shuffle stays put while you tweak selections.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function buildRandomPlaylist(showsAndEpisodes, seed) {
    const rand = mulberry32(seed);
    const allEpisodes = showsAndEpisodes.flatMap((show) =>
        show.episodes.map((ep) => ({ ...ep, showTitle: show.title, showRatingKey: show.ratingKey }))
    );

    for (let i = allEpisodes.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [allEpisodes[i], allEpisodes[j]] = [allEpisodes[j], allEpisodes[i]];
    }
    return allEpisodes;
}

export default function PreviewPanel({
    selected,
    playlistOrder,
    onChangePlaylistOrder,
    episodesByShow,
    selectedEpisodes,
    episodesError,
    onPlaylistCreated,
    editingPlaylist,
    onCancelEdit,
    onToggleEpisode,
    onBusyChange,
}) {
    const [autoPreview, setAutoPreview] = useState([]);
    // Episode ratingKeys in the order the user dragged them into, or null to
    // use the automatic Take turns / Shuffle order.
    const [manualOrder, setManualOrder] = useState(null);
    const rowSensors = useSortSensors({ keyboard: true });
    // { label, done, total } while a save is running, otherwise null.
    const [progress, setProgress] = useState(null);
    // { type: 'success' | 'error', text } after a save finishes.
    const [notice, setNotice] = useState(null);
    const busy = progress !== null;

    // Let the rest of the page lock its own reordering while a save runs.
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    const [playlistName, setPlaylistName] = useState('');
    const [shuffleSeed, setShuffleSeed] = useState(() => Math.floor(Math.random() * 2 ** 32));

    useEffect(() => {
        const showsAndEpisodes = selected
            .map((show) => {
                const episodes = episodesByShow?.[show.ratingKey] ?? [];
                const selectedEps = selectedEpisodes?.[show.ratingKey];
                const filtered = selectedEps
                    ? episodes.filter((ep) => selectedEps.has(ep.ratingKey))
                    : episodes;
                return { ...show, episodes: filtered };
            })
            .filter((show) => show.episodes.length > 0);

        setAutoPreview(
            playlistOrder === 'random'
                ? buildRandomPlaylist(showsAndEpisodes, shuffleSeed)
                : buildRoundRobinPlaylist(showsAndEpisodes)
        );
    }, [selected, playlistOrder, shuffleSeed, episodesByShow, selectedEpisodes]);

    // Apply the user's drag order on top of the automatic one. Episodes added
    // since the last drag go to the end; removed ones simply drop out.
    const preview = useMemo(() => {
        if (!manualOrder) return autoPreview;
        const position = new Map(manualOrder.map((key, i) => [key, i]));
        const known = autoPreview
            .filter((e) => position.has(String(e.ratingKey)))
            .sort((a, b) => position.get(String(a.ratingKey)) - position.get(String(b.ratingKey)));
        const added = autoPreview.filter((e) => !position.has(String(e.ratingKey)));
        return [...known, ...added];
    }, [autoPreview, manualOrder]);

    // Changing the mix mode starts the order over.
    useEffect(() => {
        setManualOrder(null);
    }, [playlistOrder]);

    // Dragging the shows into a new order also starts the playlist order over.
    const prevShowKeys = useRef(null);
    useEffect(() => {
        const keys = selected.map((s) => String(s.ratingKey));
        const prev = prevShowKeys.current;
        prevShowKeys.current = keys;
        const sameShowsNewOrder =
            prev &&
            prev.length === keys.length &&
            prev.join() !== keys.join() &&
            [...prev].sort().join() === [...keys].sort().join();
        if (sameShowsNewOrder) setManualOrder(null);
    }, [selected]);

    // Editing an existing playlist starts from its current order.
    useEffect(() => {
        setManualOrder(editingPlaylist?.order ?? null);
    }, [editingPlaylist]);

    function handleRowDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        const keys = preview.map((e) => String(e.ratingKey));
        const from = keys.indexOf(String(active.id));
        const to = keys.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        setManualOrder(arrayMove(keys, from, to));
    }

    const totalMs = preview.reduce((sum, e) => sum + (e.durationMs || 0), 0);

    function onProgressEvent(event) {
        setProgress({
            label: STAGE_LABELS[event.stage] ?? 'Working…',
            done: event.done ?? null,
            total: event.total ?? null,
        });
    }

    async function save(url, method, body, successText) {
        setNotice(null);
        setProgress({ label: 'Starting…', done: null, total: null });
        try {
            const result = await runWithProgress(
                url,
                {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
                onProgressEvent
            );
            setNotice({ type: 'success', text: successText(result) });
            return true;
        } catch (err) {
            setNotice({ type: 'error', text: err.message || 'Something went wrong' });
            return false;
        } finally {
            setProgress(null);
        }
    }

    async function createPlaylist() {
        const name = playlistName.trim();
        const ok = await save(
            '/api/playlist/build',
            'POST',
            { title: name, episodeKeys: preview.map((e) => e.ratingKey) },
            (r) => `Created “${name}” with ${r.added} episodes.`
        );
        if (ok) {
            setPlaylistName('');
            onPlaylistCreated?.();
        }
    }

    async function updatePlaylist() {
        const ok = await save(
            `/api/playlists/${editingPlaylist.playlistKey}`,
            'PUT',
            { episodeKeys: preview.map((e) => e.ratingKey) },
            (r) => `Updated the playlist with ${r.count} episodes.`
        );
        if (ok) onPlaylistCreated?.();
    }

    function removeFromPreview(ep) {
        onToggleEpisode(ep.showRatingKey, ep.ratingKey);
    }

    // Nothing chosen yet: hide the preview and create controls so the only
    // thing to do is search for a show.
    if (selected.length === 0 && !editingPlaylist) return null;

    return (
        <section className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
            <div>
                <h3 className="text-base font-semibold tracking-tight">
                    Playlist preview
                </h3>
                <p className="mt-1 text-sm muted">
                    This is exactly what will be created, in this order. Remove
                    any episode you don&apos;t want.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="seg" role="radiogroup" aria-label="Playlist order">
                    {[
                        ['round-robin', 'Take turns'],
                        ['random', 'Shuffle'],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            disabled={busy}
                            role="radio"
                            aria-checked={playlistOrder === value}
                            data-active={playlistOrder === value}
                            onClick={() => onChangePlaylistOrder(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {playlistOrder === 'random' && (
                    <button
                        type="button"
                        disabled={busy}
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                            setManualOrder(null);
                            setShuffleSeed(Math.floor(Math.random() * 2 ** 32));
                        }}
                    >
                        ↻ Reshuffle
                    </button>
                )}
                <span className="text-sm muted">
                    {playlistOrder === 'random'
                        ? 'Episodes from all your shows in a random order.'
                        : 'Alternates between your shows: one episode from each, then repeat.'}
                </span>
            </div>

            {episodesError && (
                <div className="alert alert-danger">
                    {episodesError}
                </div>
            )}

            {preview.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm muted">
                    No episodes selected. Tick some episodes above to add them
                    to the playlist.
                </div>
            ) : (
                <>
                    <div className="text-sm muted">
                        {selected.length} {selected.length === 1 ? 'show' : 'shows'} ·{' '}
                        {preview.length} episodes
                        {totalMs > 0 && <> · {formatRuntime(totalMs)} total</>}
                        {manualOrder && (
                            <>
                                {' '}
                                <span className="chip chip-accent">Custom order</span>{' '}
                                <button
                                    type="button"
                                    disabled={busy}
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setManualOrder(null)}
                                >
                                    Reset order
                                </button>
                            </>
                        )}
                        <span className="block text-xs">
                            {busy ? 'Saving… the order is locked until it finishes.' : 'Drag the ⠿ handle on a row to change the order.'}
                        </span>
                    </div>
                    <div className="tbl-wrap max-h-[480px]">
                        {/* DndContext renders helper <div>s, so it must sit outside <table>. */}
                        <DndContext
                            sensors={rowSensors}
                            collisionDetection={closestCenter}
                            modifiers={[lockY]}
                            onDragEnd={handleRowDragEnd}
                        >
                        <table className="tbl tbl-fixed" style={{ minWidth: '46rem' }}>
                            <colgroup>
                                <col style={{ width: '3rem' }} />
                                <col style={{ width: '2.75rem' }} />
                                <col style={{ width: '10rem' }} />
                                <col style={{ width: '5.5rem' }} />
                                <col />
                                <col style={{ width: '6rem' }} />
                                <col style={{ width: '6.5rem' }} />
                                <col style={{ width: '6.5rem' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="px-2 py-2" />
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Show</th>
                                    <th className="px-3 py-2">Episode</th>
                                    <th className="px-3 py-2">Title</th>
                                    <th className="px-3 py-2">Runtime</th>
                                    <th className="px-3 py-2" />
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <SortableContext
                                items={preview.map((e) => String(e.ratingKey))}
                                strategy={verticalListSortingStrategy}
                            >
                            <tbody>
                                {preview.map((e, i) => (
                                    <SortableRow key={e.ratingKey} id={String(e.ratingKey)} disabled={busy}>
                                        <td className="px-3 py-2 muted">
                                            {i + 1}
                                        </td>
                                        <td className="px-3 py-2 font-medium">
                                            {e.showTitle}
                                        </td>
                                        <td className="px-3 py-2">
                                            S{e.season}E{e.episode}
                                        </td>
                                        <td className="px-3 py-2">
                                            {e.title}
                                        </td>
                                        <td className="px-3 py-2 muted whitespace-nowrap">
                                            {formatRuntime(e.durationMs)}
                                        </td>
                                        <td className="px-3 py-2">
                                            {e.watched && (
                                                <span className="chip chip-accent">Watched</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => removeFromPreview(e)}
                                                className="btn btn-danger btn-sm"
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </SortableRow>
                                ))}
                            </tbody>
                            </SortableContext>
                        </table>
                        </DndContext>
                    </div>
                </>
            )}
            {editingPlaylist ? (
                <div className="flex items-center gap-2 justify-center">
                    <button
                        onClick={onCancelEdit}
                        disabled={busy}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={preview.length === 0 || busy}
                        onClick={updatePlaylist}
                        className="btn btn-primary"
                    >
                        {busy ? 'Updating…' : 'Update Playlist'}
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 justify-center">
                    <input
                        value={playlistName}
                        type="text"
                        onChange={(e) => setPlaylistName(e.target.value)}
                        disabled={busy}
                        placeholder="Enter playlist name"
                        className="input"
                    />
                    <button
                        disabled={
                            playlistName.trim().length === 0 ||
                            preview.length === 0 ||
                            busy
                        }
                        title={
                            preview.length === 0
                                ? 'Select at least one episode first'
                                : undefined
                        }
                        onClick={createPlaylist}
                        className="btn btn-primary whitespace-nowrap"
                    >
                        {busy ? 'Creating…' : 'Create Playlist'}
                    </button>
                </div>
            )}

            {progress && (
                <div className="space-y-1.5" role="status" aria-live="polite">
                    <div className="flex items-center justify-between text-sm">
                        <span>{progress.label}</span>
                        {progress.total ? (
                            <span className="muted">
                                {progress.done ?? 0} / {progress.total}
                            </span>
                        ) : null}
                    </div>
                    <div className="progress">
                        <div
                            className="progress-bar"
                            data-indeterminate={!progress.total}
                            style={{
                                width: progress.total
                                    ? `${Math.round(((progress.done ?? 0) / progress.total) * 100)}%`
                                    : '100%',
                            }}
                        />
                    </div>
                </div>
            )}
            {notice && (
                <div
                    role={notice.type === 'error' ? 'alert' : 'status'}
                    className={`alert ${notice.type === 'success' ? 'alert-success' : 'alert-danger'}`}
                >
                    {notice.text}
                </div>
            )}
        </section>
    );
}
