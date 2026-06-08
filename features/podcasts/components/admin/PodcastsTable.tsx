'use client';

import React, { useState, useMemo } from 'react';
import { idMatchesQuery } from '@/utils/search-scoring';
import { Plus, RefreshCw, Search, Pencil, Trash2, Link, Mic, Music, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineMediaRef } from '@/features/files';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { PcShow, PcEpisodeWithShow } from '../../types';
import { podcastService } from '../../service';

interface PodcastsTableProps {
    activeTab: 'shows' | 'episodes';
    shows: PcShow[];
    episodes: PcEpisodeWithShow[];
    isLoading: boolean;
    selectedId: string | null;
    onSelectShow: (show: PcShow) => void;
    onSelectEpisode: (episode: PcEpisodeWithShow) => void;
    onCreate: () => void;
    onRefresh: () => void;
    onDeleteShow: (id: string) => void;
    onDeleteEpisode: (id: string) => void;
}

function CopyLinkButton({ slug }: { slug: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        const url = `${window.location.origin}/podcast/${slug}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            title={copied ? 'Copied!' : 'Copy share link'}
        >
            <Link className="h-3.5 w-3.5" />
        </button>
    );
}

export function PodcastsTable({
    activeTab,
    shows,
    episodes,
    isLoading,
    selectedId,
    onSelectShow,
    onSelectEpisode,
    onCreate,
    onRefresh,
    onDeleteShow,
    onDeleteEpisode,
}: PodcastsTableProps) {
    const [search, setSearch] = useState('');
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredShows = useMemo(
        () => shows.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase()) || idMatchesQuery(s, search)),
        [shows, search]
    );

    const filteredEpisodes = useMemo(
        () =>
            episodes.filter(
                (e) =>
                    e.title.toLowerCase().includes(search.toLowerCase()) ||
                    e.slug.toLowerCase().includes(search.toLowerCase()) ||
                    (e.show?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
                    idMatchesQuery(e, search)
            ),
        [episodes, search]
    );

    const handleDeleteConfirm = async () => {
        if (!pendingDeleteId) return;
        setIsDeleting(true);
        try {
            if (activeTab === 'shows') {
                await podcastService.removeShow(pendingDeleteId);
                onDeleteShow(pendingDeleteId);
            } else {
                await podcastService.removeEpisode(pendingDeleteId);
                onDeleteEpisode(pendingDeleteId);
            }
        } catch (err) {
            console.error('Delete failed', err);
        } finally {
            setIsDeleting(false);
            setPendingDeleteId(null);
        }
    };

    // Fixed widths per column per row — no Math.random() to avoid SSR/client hydration mismatch
    const SKELETON_WIDTHS = [
        ['w-3/5', 'w-2/5', 'w-4/5', 'w-1/2'],
        ['w-4/5', 'w-3/5', 'w-2/5', 'w-3/4'],
        ['w-1/2', 'w-4/5', 'w-3/5', 'w-2/3'],
        ['w-2/3', 'w-1/2', 'w-4/5', 'w-3/5'],
        ['w-3/4', 'w-2/3', 'w-1/2', 'w-4/5'],
        ['w-2/5', 'w-3/4', 'w-2/3', 'w-1/2'],
    ] as const;

    const SkeletonRows = () => (
        <>
            {SKELETON_WIDTHS.map((cols, i) => (
                <tr key={i} className="border-b">
                    {cols.map((w, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className={`h-4 bg-muted rounded animate-pulse ${w}`} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );

    return (
        <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={`Search ${activeTab}…`}
                        className="pl-8 h-8 text-sm"
                    />
                </div>
                <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 px-2" title="Refresh">
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={onCreate} className="h-8 gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    New {activeTab === 'shows' ? 'Show' : 'Episode'}
                </Button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 border-b z-10">
                        {activeTab === 'shows' ? (
                            <tr>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Title</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Slug</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Author</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Published</th>
                                <th className="w-24 px-4 py-2" />
                            </tr>
                        ) : (
                            <tr>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Title</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Show</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Mode</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Published</th>
                                <th className="w-24 px-4 py-2" />
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <SkeletonRows />
                        ) : activeTab === 'shows' ? (
                            filteredShows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                                        {search ? 'No shows match your search.' : 'No shows yet. Create one to get started.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredShows.map((show) => (
                                    <tr
                                        key={show.id}
                                        onClick={() => onSelectShow(show)}
                                        className={`border-b cursor-pointer group transition-colors hover:bg-muted/40 ${
                                            selectedId === show.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                                        }`}
                                    >
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <InlineMediaRef
                                                    ref={show.image_url ?? null}
                                                    size={{ width: 28, height: 28 }}
                                                    fit="cover"
                                                    rounded="md"
                                                    fallbackIcon={<Mic className="h-3.5 w-3.5 text-muted-foreground" />}
                                                    className="shrink-0"
                                                    alt=""
                                                />
                                                <span className="font-medium truncate max-w-[180px]">{show.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs truncate max-w-[120px]">{show.slug}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">{show.author ?? '—'}</td>
                                        <td className="px-4 py-2.5">
                                            {show.is_published ? (
                                                <CheckCircle2 className="h-4 w-4 text-success" />
                                            ) : (
                                                <Circle className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <CopyLinkButton slug={show.slug} />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onSelectShow(show); }}
                                                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Edit"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setPendingDeleteId(show.id); }}
                                                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )
                        ) : filteredEpisodes.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                                    {search ? 'No episodes match your search.' : 'No episodes yet. Create one to get started.'}
                                </td>
                            </tr>
                        ) : (
                            filteredEpisodes.map((ep) => (
                                <tr
                                    key={ep.id}
                                    onClick={() => onSelectEpisode(ep)}
                                    className={`border-b cursor-pointer group transition-colors hover:bg-muted/40 ${
                                        selectedId === ep.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                                    }`}
                                >
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <InlineMediaRef
                                                ref={ep.image_url ?? null}
                                                size={{ width: 28, height: 28 }}
                                                fit="cover"
                                                rounded="md"
                                                fallbackIcon={<Music className="h-3.5 w-3.5 text-muted-foreground" />}
                                                className="shrink-0"
                                                alt=""
                                            />
                                            <div className="min-w-0">
                                                <p className="font-medium truncate max-w-[180px]">{ep.title}</p>
                                                <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">{ep.slug}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground text-xs truncate max-w-[120px]">{ep.show?.title ?? '—'}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                                            {ep.display_mode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        {ep.is_published ? (
                                            <CheckCircle2 className="h-4 w-4 text-success" />
                                        ) : (
                                            <Circle className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center justify-end gap-0.5">
                                            <CopyLinkButton slug={ep.slug} />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSelectEpisode(ep); }}
                                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                                                title="Edit"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setPendingDeleteId(ep.id); }}
                                                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Delete confirmation */}
            <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {activeTab === 'shows' ? 'show' : 'episode'}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone.
                            {activeTab === 'shows' && ' Episodes linked to this show will have their show reference removed.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {isDeleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
