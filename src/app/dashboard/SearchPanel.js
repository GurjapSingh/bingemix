'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
    arrayMove,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatAirDate, formatRuntime, formatRating } from './episodeFormat';
import { useSortSensors, lockX } from './dnd';

// A show tab that can be dragged left/right to change the show order.
function SortableTab({ show, active, chosen, total, onSelect, locked }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: show.ratingKey, disabled: locked });
    return (
        <button
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            role="tab"
            aria-selected={active}
            onClick={onSelect}
            className="folder-tab"
            title={locked ? show.title : `${show.title} (drag to reorder)`}
            style={{
                transform: CSS.Translate.toString(transform),
                transition,
                zIndex: isDragging ? 2 : undefined,
                opacity: isDragging ? 0.85 : undefined,
                cursor: locked ? 'default' : isDragging ? 'grabbing' : 'grab',
            }}
        >
            {show.title}
            {total > 0 && (
                <span className="chip">
                    {chosen}/{total}
                </span>
            )}
        </button>
    );
}

// Fades the edges of a horizontally scrolling row when more is hidden off-screen.
function useScrollFade(dep) {
    const ref = useRef(null);
    const [fade, setFade] = useState({ left: false, right: false });

    const update = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        setFade({
            left: el.scrollLeft > 2,
            right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
        });
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        update();
        el.addEventListener('scroll', update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener('scroll', update);
            ro.disconnect();
        };
    }, [update, dep]);

    const mask = `linear-gradient(to right, ${fade.left ? 'transparent, #000 28px' : '#000, #000 0'}, ${fade.right ? '#000 calc(100% - 28px), transparent' : '#000 100%, #000'})`;
    return { ref, fade, style: { WebkitMaskImage: mask, maskImage: mask } };
}

function ShowEpisodeSelector({ show, episodes, selectedEpisodes, onToggleEpisode, onToggleAllInSeason }) {
    const seasons = [...new Set(episodes.map((ep) => ep.season))].sort((a, b) => a - b);
    const [activeTab, setActiveTab] = useState(seasons[0] ?? null);
    const seasonFade = useScrollFade(seasons.length);

    if (seasons.length === 0) return null;

    const selectedEps = selectedEpisodes?.[show.ratingKey] ?? new Set();
    const seasonEpisodes = episodes.filter((ep) => ep.season === activeTab);
    const allSelected = seasonEpisodes.length > 0 && seasonEpisodes.every((ep) => selectedEps.has(ep.ratingKey));
    const someSelected = seasonEpisodes.some((ep) => selectedEps.has(ep.ratingKey));

    return (
        <div className="mt-3">
            <div className="relative border-b border-[var(--border)]">
            {seasonFade.fade.left && (
                <button
                    type="button"
                    aria-label="Scroll seasons left"
                    className="season-arrow left-0"
                    onClick={() => seasonFade.ref.current?.scrollBy({ left: -260, behavior: 'smooth' })}
                >
                    ‹
                </button>
            )}
            {seasonFade.fade.right && (
                <button
                    type="button"
                    aria-label="Scroll seasons right"
                    className="season-arrow right-0"
                    onClick={() => seasonFade.ref.current?.scrollBy({ left: 260, behavior: 'smooth' })}
                >
                    ›
                </button>
            )}
            <div
                ref={seasonFade.ref}
                style={seasonFade.style}
                className="no-scrollbar flex overflow-x-auto"
            >
                {seasons.map((s) => {
                    const eps = episodes.filter((ep) => ep.season === s);
                    const all = eps.every((ep) => selectedEps.has(ep.ratingKey));
                    const some = eps.some((ep) => selectedEps.has(ep.ratingKey));
                    return (
                        <div
                            key={s}
                            className={`flex shrink-0 items-center gap-1.5 pl-2 ${
                                activeTab === s
                                    ? 'border-b-2 border-[var(--accent)]'
                                    : ''
                            }`}
                        >
                            <input
                                type="checkbox"
                                aria-label={`Select all of season ${s}`}
                                checked={all}
                                ref={(el) => {
                                    if (el) el.indeterminate = !all && some;
                                }}
                                onChange={(e) =>
                                    onToggleAllInSeason(show.ratingKey, eps, e.target.checked)
                                }
                            />
                            <button
                                onClick={(e) => {
                                    setActiveTab(s);
                                    e.currentTarget.scrollIntoView({
                                        inline: 'nearest',
                                        block: 'nearest',
                                        behavior: 'smooth',
                                    });
                                }}
                                className={`whitespace-nowrap py-1.5 pr-3 text-xs font-medium transition-colors ${
                                    activeTab === s
                                        ? 'text-[var(--foreground)]'
                                        : 'muted hover:text-[var(--foreground)]'
                                }`}
                            >
                                Season {s}
                            </button>
                        </div>
                    );
                })}
            </div>
            </div>
            <div className="tbl-wrap mt-3 max-h-[260px]">
                <table className="tbl tbl-fixed" style={{ minWidth: '40rem' }}>
                    <colgroup>
                        <col style={{ width: '2.75rem' }} />
                        <col style={{ width: '3.5rem' }} />
                        <col />
                        <col style={{ width: '8.5rem' }} />
                        <col style={{ width: '6rem' }} />
                        <col style={{ width: '5rem' }} />
                        <col style={{ width: '6.5rem' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={(el) => {
                                        if (el) el.indeterminate = !allSelected && someSelected;
                                    }}
                                    onChange={(e) =>
                                        onToggleAllInSeason(show.ratingKey, seasonEpisodes, e.target.checked)
                                    }
                                />
                            </th>
                            <th className="px-3 py-2">Ep</th>
                            <th className="px-3 py-2">Title</th>
                            <th className="px-3 py-2">Aired</th>
                            <th className="px-3 py-2">Runtime</th>
                            <th className="px-3 py-2">Rating</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {seasonEpisodes.map((ep) => (
                            <tr
                                key={ep.ratingKey}
                                className="cursor-pointer"
                                onClick={() => onToggleEpisode(show.ratingKey, ep.ratingKey)}
                            >
                                <td className="px-3 py-1.5">
                                    <input
                                        type="checkbox"
                                        checked={selectedEps.has(ep.ratingKey)}
                                        onChange={() => onToggleEpisode(show.ratingKey, ep.ratingKey)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </td>
                                <td className="px-3 py-1.5 muted whitespace-nowrap">
                                    E{ep.episode}
                                </td>
                                <td className="px-3 py-1.5">{ep.title}</td>
                                <td className="px-3 py-1.5 muted whitespace-nowrap">
                                    {formatAirDate(ep.airDate)}
                                </td>
                                <td className="px-3 py-1.5 muted whitespace-nowrap">
                                    {formatRuntime(ep.durationMs)}
                                </td>
                                <td className="px-3 py-1.5 muted whitespace-nowrap">
                                    {formatRating(ep.rating)}
                                </td>
                                <td className="px-3 py-1.5">
                                    {ep.watched && <span className="chip chip-accent">Watched</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function SearchPanel({
    locked = false,
    selected,
    onChangeSelected,
    episodesByShow,
    selectedEpisodes,
    onToggleEpisode,
    onToggleAllInSeason,
}) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef(null);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [results]);

    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setResults([]);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setError('');
            return;
        }
        const timer = setTimeout(async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(
                    `/api/search?query=${encodeURIComponent(trimmed)}`,
                    { cache: 'no-store' }
                );
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                setResults(data?.results || []);
            } catch (err) {
                setError(err.message || 'Search error');
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const [activeShowKey, setActiveShowKey] = useState(null);
    const tabsFade = useScrollFade(selected.length);
    const tabSensors = useSortSensors();

    function handleTabDragEnd({ active, over }) {
        if (!over || active.id === over.id) return;
        const from = selected.findIndex((s) => s.ratingKey === active.id);
        const to = selected.findIndex((s) => s.ratingKey === over.id);
        if (from < 0 || to < 0) return;
        onChangeSelected(arrayMove(selected, from, to));
    }
    const activeShow =
        selected.find((s) => s.ratingKey === activeShowKey) ?? selected[0] ?? null;

    function addShow(item) {
        if (selected.some((s) => s.ratingKey === item.ratingKey)) return;
        onChangeSelected([...selected, item]);
        setActiveShowKey(item.ratingKey);
        setQuery('');
        setResults([]);
    }

    function handleKeyDown(e) {
        if (results.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addShow(results[highlightedIndex]);
        } else if (e.key === 'Escape') {
            setResults([]);
            setQuery('');
        }
    }

    function removeShow(key) {
        onChangeSelected(selected.filter((s) => s.ratingKey !== key));
    }

    return (
        <section className="mt-5 space-y-4">

            <div className="relative" ref={containerRef}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    type="text"
                    placeholder="Search by title (e.g., The Office)"
                    className="input pr-20"
                />
                {loading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm muted">
                        Searching…
                    </span>
                )}
                {error && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 menu px-3 py-2 text-sm text-red-500">
                        {error}
                    </div>
                )}
                {!error && results.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto menu">
                        {results.map((r, i) => {
                            const alreadyAdded = selected.some((s) => s.ratingKey === r.ratingKey);
                            return (
                                <li
                                    key={r.ratingKey}
                                    onMouseDown={() => addShow(r)}
                                    onMouseEnter={() => setHighlightedIndex(i)}
                                    className={`flex cursor-pointer items-center justify-between px-3 py-2 ${
                                        i === highlightedIndex ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'
                                    }`}
                                >
                                    <div>
                                        <div className="font-medium">{r.title}</div>
                                        <div className="text-xs muted">{r.year ?? '—'}</div>
                                    </div>
                                    {i === highlightedIndex && !alreadyAdded ? (
                                        <span className="text-xs muted">↵ to add</span>
                                    ) : alreadyAdded ? (
                                        <span className="text-xs muted">Added</span>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {!loading && !error && results.length === 0 && query.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 menu px-3 py-2 text-sm muted">
                        No matches.
                    </div>
                )}
            </div>
            <div className="pt-4 space-y-4">
                {selected.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                        <div className="font-medium">No shows added yet</div>
                        <p className="mt-1 text-sm muted">
                            Search above and press Enter to add a show. Add as
                            many as you like, then choose which episodes to
                            include.
                        </p>
                    </div>
                ) : (
                    <>
                    <h3 className="font-semibold">Your shows</h3>
                    <div>
                    <DndContext
                        sensors={tabSensors}
                        collisionDetection={closestCenter}
                        modifiers={[lockX]}
                        onDragEnd={handleTabDragEnd}
                    >
                    <div
                        role="tablist"
                        aria-label="Selected shows"
                        className="folder-tabs"
                        ref={tabsFade.ref}
                        style={tabsFade.style}
                    >
                            <SortableContext
                                items={selected.map((s) => s.ratingKey)}
                                strategy={horizontalListSortingStrategy}
                            >
                                {selected.map((s) => (
                                    <SortableTab
                                        key={s.ratingKey}
                                        show={s}
                                        active={activeShow?.ratingKey === s.ratingKey}
                                        total={(episodesByShow?.[s.ratingKey] ?? []).length}
                                        chosen={selectedEpisodes?.[s.ratingKey]?.size ?? 0}
                                        onSelect={() => setActiveShowKey(s.ratingKey)}
                                        locked={locked}
                                    />
                                ))}
                            </SortableContext>
                    </div>
                    </DndContext>
                    {activeShow && (() => {
                        const s = activeShow;
                        const episodes = episodesByShow?.[s.ratingKey] ?? [];
                        return (
                            <div
                                role="tabpanel"
                                className="folder-panel"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium">{s.title}</div>
                                        <div className="text-xs muted">{s.year ?? '—'}</div>
                                    </div>
                                    <button
                                        onClick={() => removeShow(s.ratingKey)}
                                        className="btn btn-secondary btn-sm"
                                    >
                                        Remove show
                                    </button>
                                </div>
                                {episodes.length === 0 ? (
                                    <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs muted">
                                        Loading episodes…
                                    </div>
                                ) : (
                                    <ShowEpisodeSelector
                                        key={s.ratingKey}
                                        show={s}
                                        episodes={episodes}
                                        selectedEpisodes={selectedEpisodes}
                                        onToggleEpisode={onToggleEpisode}
                                        onToggleAllInSeason={onToggleAllInSeason}
                                    />
                                )}
                            </div>
                        );
                    })()}
                    </div>
                    </>
                )}
            </div>
        </section>
    );
}
