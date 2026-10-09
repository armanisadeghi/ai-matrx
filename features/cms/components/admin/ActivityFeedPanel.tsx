'use client';

import React, { useState, useMemo } from 'react';
import { SurfaceRuntimeProvider } from '@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext';
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from '@/features/surfaces/manifests/admin-knowledge.manifest';
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
import { MatrxDataTable, type MatrxColumnDef } from '@ai-matrx/design-system/data-table';
import { Workflow, User, Cog, RefreshCw, Loader2 } from 'lucide-react';
import { InlineMediaRef } from "@ai-matrx/media/react";
import { openFilePreview } from '@/features/files/components/preview/openFilePreview';

const ACTOR_META = {
    agent: { label: 'Agent', icon: Workflow, className: 'bg-primary/15 text-primary-ink border-primary/30' },
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

type ActivityRow = ReturnType<typeof useCmsAdminActivity>['activity'][number];

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

    const columns = useMemo((): MatrxColumnDef<ActivityRow>[] => [
        { id: 'created_at', header: 'Time', accessorFn: (row) => row.created_at, width: 150,
          cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</span> },
        { id: 'actor', header: 'Actor', accessorFn: (row) => row.changes?.actor ?? 'unknown', filter: 'select', width: 110,
          cell: (row) => <ActorBadge actor={row.changes?.actor} /> },
        { id: 'site', header: 'Site', accessorFn: (row) => siteName(row.client_id), filter: 'select', width: 150,
          cell: (row) => <span className="block truncate">{siteName(row.client_id)}</span> },
        { id: 'activity_type', header: 'Type', accessorFn: (row) => row.activity_type, filter: 'select', width: 150,
          cell: (row) => <span className="font-mono text-[11px] text-muted-foreground">{row.activity_type}</span> },
        { id: 'description', header: 'Description', accessorFn: (row) => row.description ?? '', width: 420,
          cell: (row) => <span className="block truncate">{row.description}</span> },
        { id: 'media', header: 'Media', sortable: false, filter: false, accessorFn: (row) => (row.changes?.metadata?.capture_media_refs ?? []).length, width: 140,
          cell: (row) => <CaptureMediaLinks fileIds={row.changes?.metadata?.capture_media_refs} /> },
        { id: 'by', header: 'By', accessorFn: (row) => row.user_email ?? row.user_id ?? '—', width: 180,
          cell: (row) => <span className="block truncate text-muted-foreground">{row.user_email ?? row.user_id ?? '—'}</span> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [sites]);

    return (
        <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: 'cms_agents', cms_sites: sites, cms_activity_filter: { siteId, entityType, actor }, cms_activity_log: activity })}>
        <div className="flex flex-col h-full">
            <div className="flex-none flex items-center gap-2 px-1 py-2 flex-wrap">
                <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="w-[160px]">
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
                    <SelectTrigger className="w-[130px]">
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
                    <SelectTrigger className="w-[120px]">
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

                <Button icon={isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />} variant="quiet" onClick={refresh}>
                    Refresh
                </Button>
            </div>

            <div className="flex-1 min-h-0">
                <MatrxDataTable<ActivityRow>
                    tableId="cms-admin-activity"
                    data={activity as ActivityRow[]}
                    columns={columns}
                    getRowId={(row) => row.id}
                    isLoading={isLoading && activity.length === 0}
                    read={{ status: error ? 'error' : isLoading ? 'loading' : 'ready', error: error ?? undefined, onRetry: refresh, what: 'the activity feed' }}
                    defaultSort={{ id: 'created_at', direction: 'desc' }}
                    emptyState={{ title: 'No activity yet', description: 'Mutations from any site will appear here within 8s.' }}
                    detail={{ enabled: false }}
                    copy={{
                        label: 'CMS activity',
                        location: 'CMS Admin Activity Feed',
                        rowKind: 'cms-activity',
                        listKind: 'cms-activity-list',
                        humanRow: (row) => `${row.activity_type}: ${row.description ?? ''}`.trim(),
                        agentRow: (row) => row,
                    }}
                />
            </div>
        </div>
        </SurfaceRuntimeProvider>
    );
}
