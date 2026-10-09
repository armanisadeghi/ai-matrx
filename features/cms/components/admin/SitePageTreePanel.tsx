'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SurfaceRuntimeProvider } from '@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext';
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from '@/features/surfaces/manifests/admin-knowledge.manifest';
import { CmsPageService } from '../../services/cmsService';
import { activeSiteDomain, clientPageUrl, clientSiteRootUrl, sitePreviewToken } from '../../utils/pageUrls';
import type { ClientPageSummary, ClientSiteSummary } from '../../types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MatrxDataTable, type MatrxColumnDef } from '@ai-matrx/design-system/data-table';
import { ExternalLink, Eye, Loader2, RefreshCw, FileText } from 'lucide-react';

type AdminPage = ClientPageSummary & { client_id: string };

export default function SitePageTreePanel({ sites }: { sites: ClientSiteSummary[] }) {
    const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
    const [pages, setPages] = useState<AdminPage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<unknown>(null);

    const site = sites.find((s) => s.id === siteId);

    const fetchPages = useCallback(async () => {
        if (!siteId) {
            setPages([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            // Verification screenshots (capture_media_refs) live on the Activity
            // Feed as clickable media link-outs — not here (they are events, not
            // page state).
            setPages(await CmsPageService.adminListPages(siteId));
            setLoadError(null);
        } catch (err) {
            setPages([]);
            setLoadError(err ?? true);
        } finally {
            setIsLoading(false);
        }
    }, [siteId]);

    useEffect(() => {
        fetchPages();
    }, [fetchPages]);

    const sorted = useMemo(
        () => [...pages].sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.sort_order - b.sort_order),
        [pages],
    );

    const columns = useMemo((): MatrxColumnDef<AdminPage>[] => [
        { id: 'title', header: 'Title', accessorFn: (page) => page.title, width: 260,
          cell: (page) => (
            <span className="block truncate font-medium">
                {page.title}
                {page.is_home_page && <Badge variant="outline" className="ml-1.5 text-[9px] py-0">home</Badge>}
            </span>
          ) },
        { id: 'category', header: 'Category', accessorFn: (page) => page.category ?? '', filter: 'select', width: 140,
          cell: (page) => <span className="text-muted-foreground">{page.category ?? '—'}</span> },
        { id: 'state', header: 'State', accessorFn: (page) => (page.is_published ? 'Published' : 'Unpublished') + (page.has_draft ? ' · Draft pending' : ''), filter: 'select', width: 220,
          cell: (page) => (
            <div className="flex items-center gap-1">
                <Badge variant={page.is_published ? 'default' : 'secondary'} className="text-[10px]">
                    {page.is_published ? 'Published' : 'Unpublished'}
                </Badge>
                {page.has_draft && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">Draft pending</Badge>
                )}
            </div>
          ) },
        { id: 'links', header: 'Links', sortable: false, filter: false, accessorFn: (page) => page.slug, width: 100,
          cell: (page) => (
            <div className="flex items-center gap-2">
                {site && (
                    <>
                        <a href={clientPageUrl({ siteSlug: site.slug, slug: page.slug, route: page.route, category: page.category, domain: activeSiteDomain(site) })}
                            target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary" title="Live">
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {page.has_draft && (
                            <a href={clientPageUrl({ siteSlug: site.slug, slug: page.slug, route: page.route, category: page.category, preview: true, previewToken: sitePreviewToken(site) })}
                                target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:opacity-80" title="Preview draft">
                                <Eye className="h-3.5 w-3.5" />
                            </a>
                        )}
                    </>
                )}
            </div>
          ) },
    ], [site]);

    return (
        <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: 'cms_agents', cms_sites: sites, ...(siteId ? { cms_selected_site_id: siteId } : {}), cms_site_pages: sorted })}>
        <div className="flex flex-col h-full">
            <div className="flex-none flex items-center gap-2 px-1 py-2">
                <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select a site" />
                    </SelectTrigger>
                    <SelectContent>
                        {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {site && (
                    <a
                        href={clientSiteRootUrl(site.slug, false, activeSiteDomain(site))}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                        /c/{site.slug} <ExternalLink className="h-3 w-3" />
                    </a>
                )}
                <div className="flex-1" />
                <Button icon={isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />} variant="quiet" onClick={fetchPages}>
                    Refresh
                </Button>
            </div>

            <div className="flex-1 min-h-0">
                <MatrxDataTable<AdminPage>
                    tableId="cms-admin-site-pages"
                    data={sorted}
                    columns={columns}
                    getRowId={(page) => page.id}
                    isLoading={isLoading && sorted.length === 0}
                    read={{ status: loadError != null ? 'error' : isLoading ? 'loading' : 'ready', error: loadError ?? undefined, onRetry: () => void fetchPages(), what: `${site?.name ?? 'this site'}'s pages` }}
                    emptyState={{ title: 'No pages on this site yet' }}
                    detail={{ enabled: false }}
                    copy={{
                        label: 'CMS site pages',
                        location: `CMS Admin Site Pages${site ? ` (${site.name})` : ''}`,
                        rowKind: 'cms-site-page',
                        listKind: 'cms-site-page-list',
                        humanRow: (page) => `${page.title}${page.category ? ` [${page.category}]` : ''} - ${page.is_published ? 'published' : 'unpublished'}${page.has_draft ? ', draft pending' : ''}`,
                        agentRow: (page) => page,
                    }}
                />
            </div>

            {sites.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs gap-2">
                    <FileText className="h-4 w-4" />
                    No sites in the fleet yet.
                </div>
            )}
        </div>
        </SurfaceRuntimeProvider>
    );
}
