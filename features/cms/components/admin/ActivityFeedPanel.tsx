'use client';

import React, { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useCmsAdminActivity } from '../../hooks/useCmsAdminActivity';
import type { ClientSiteSummary } from '../../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Workflow, User, Cog, RefreshCw, Loader2, AlertCircle, Activity } from 'lucide-react';
import { InlineMediaRef } from '@/features/files/components/inline/InlineMediaRef';
import { openFilePreview } from '@/features/files/components/preview/openFilePreview';

const ACTOR_META = {
    agent: { label: 'Agent', icon: Workflow, className: 'bg-primary/15 text-primary border-primary/30' },
    human: { label: 'Human', icon: User, className: 'bg-muted text-muted-foreground border-border' },
    system: { label: 'System', icon: Cog, className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
} as const;

/**
 * Clickable screenshot link-outs for a row's `changes.metadata.capture_media_refs`
 * (C6 — cms_verify screenshots). Each thumbnail resolves through the canonical
 * file handler (InlineMediaRef re-mints signed URLs) and opens the standard
 * file-preview WindowPanel on click.
 */
function CaptureMediaLinks({ fileIds }: { fileIds: string[] | undefined }) {
    if (!fileIds?.length) return null;
    return (
        <div className="flex items-center gap-1">
            {fileIds.map((fileId) => (
                <button
                    key={fileId}
                    type="button"
                    onClick={() => openFilePreview(fileId)}
                    className="rounded border border-border overflow-hidden hover:ring-1 hover:ring-primary focus-visible:ring-1 focus-visible:ring-primary outline-none"
                    title="Open verification screenshot"
                    aria-label="Open verification screenshot"
                >
                    <InlineMediaRef ref={fileId} size={{ width: 44, height: 28 }} fit="cover" fallback="icon" />
                </button>
            ))}
        </div>
    );
}

function ActorBadge({ actor }: { actor: string | undefined }) {
    const meta = ACTOR_META[actor as keyof typeof ACTOR_META];
    if (!meta) return <Badge variant="outline" className="text-[10px]">unknown</Badge>;
    const Icon = meta.icon;
    return (
        <Badge variant="outline" className={`text-[10px] gap-1 ${meta.className}`}>
            <Icon className="h-3 w-3" />
            {meta.label}
        </Badge>
    );
}

export default function ActivityFeedPanel({ sites }: { sites: ClientSiteSummary[] }) {
    const [siteId, setSiteId] = useState<string>('all');
    const [entityType, setEntityType] = useState<string>('all');
    const [actor, setActor] = useState<string>('all');

    const filters = useMemo(
        () => ({
            siteId: siteId === 'all' ? undefined : siteId,
            entityType: entityType === 'all' ? undefined : entityType,
            actor: actor === 'all' ? undefined : (actor as 'agent' | 'human' | 'system'),
        }),
        [siteId, entityType, actor],
    );

    const { activity, isLoading, error, refresh } = useCmsAdminActivity(filters);
    const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? id ?? '—';

    return (
        <div className="flex flex-col h-full">
            <div className="flex-none flex items-center gap-2 px-1 py-2 flex-wrap">
                <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="h-7 w-[160px] text-xs">
                        <SelectValue placeholder="All sites" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All sites</SelectItem>
                        {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={entityType} onValueChange={setEntityType}>
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All entities</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="page">Page</SelectItem>
                        <SelectItem value="html_page">HTML page</SelectItem>
                        <SelectItem value="component">Component</SelectItem>
                        <SelectItem value="version">Version</SelectItem>
                        <SelectItem value="exception">Exception</SelectItem>
                        <SelectItem value="asset">Asset</SelectItem>
                        <SelectItem value="collection">Collection</SelectItem>
                        <SelectItem value="collection_item">Collection item</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={actor} onValueChange={setActor}>
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue placeholder="All actors" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All actors</SelectItem>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="human">Human</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex-1" />

                <Button variant="ghost" size="sm" onClick={refresh} className="h-7 gap-1.5 text-xs">
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="flex-none flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md bg-destructive/10 text-destructive text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                            <TableHead className="h-8 text-xs">Time</TableHead>
                            <TableHead className="h-8 text-xs">Actor</TableHead>
                            <TableHead className="h-8 text-xs">Site</TableHead>
                            <TableHead className="h-8 text-xs">Type</TableHead>
                            <TableHead className="h-8 text-xs">Description</TableHead>
                            <TableHead className="h-8 text-xs">Media</TableHead>
                            <TableHead className="h-8 text-xs">By</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {activity.length === 0 && !isLoading && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-xs">
                                    <div className="flex flex-col items-center gap-2">
                                        <Activity className="h-6 w-6 opacity-30" />
                                        No activity yet — mutations from any site will appear here within {8}s.
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                        {activity.map((row) => (
                            <TableRow key={row.id} className="text-xs">
                                <TableCell className="whitespace-nowrap text-muted-foreground py-1.5">
                                    {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                                </TableCell>
                                <TableCell className="py-1.5">
                                    <ActorBadge actor={row.changes?.actor} />
                                </TableCell>
                                <TableCell className="py-1.5 max-w-[140px] truncate">{siteName(row.client_id)}</TableCell>
                                <TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground">
                                    {row.activity_type}
                                </TableCell>
                                <TableCell className="py-1.5 max-w-[420px] truncate">{row.description}</TableCell>
                                <TableCell className="py-1.5">
                                    <CaptureMediaLinks fileIds={row.changes?.metadata?.capture_media_refs} />
                                </TableCell>
                                <TableCell className="py-1.5 max-w-[160px] truncate text-muted-foreground">
                                    {row.user_email ?? row.user_id ?? '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
