'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CmsPageService } from '../../services/cmsService';
import { clientPageUrl, clientSiteRootUrl } from '../../utils/pageUrls';
import type { ClientPageSummary, ClientSite } from '../../types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink, Eye, Loader2, RefreshCw, FileText } from 'lucide-react';

type AdminPage = ClientPageSummary & { client_id: string };

export default function SitePageTreePanel({ sites }: { sites: ClientSite[] }) {
    const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
    const [pages, setPages] = useState<AdminPage[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

    return (
        <div className="flex flex-col h-full">
            <div className="flex-none flex items-center gap-2 px-1 py-2">
                <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="h-7 w-[200px] text-xs">
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
                        href={clientSiteRootUrl(site.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                        /c/{site.slug} <ExternalLink className="h-3 w-3" />
                    </a>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={fetchPages} className="h-7 gap-1.5 text-xs">
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                            <TableHead className="h-8 text-xs">Title</TableHead>
                            <TableHead className="h-8 text-xs">Category</TableHead>
                            <TableHead className="h-8 text-xs">State</TableHead>
                            <TableHead className="h-8 text-xs">Links</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.length === 0 && !isLoading && (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-xs">
                                    No pages on this site yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {sorted.map((page) => {
                            return (
                                <TableRow key={page.id} className="text-xs">
                                    <TableCell className="py-1.5 font-medium max-w-[220px] truncate">
                                        {page.title}
                                        {page.is_home_page && (
                                            <Badge variant="outline" className="ml-1.5 text-[9px] py-0">
                                                home
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-1.5 text-muted-foreground">{page.category ?? '—'}</TableCell>
                                    <TableCell className="py-1.5">
                                        <div className="flex items-center gap-1">
                                            <Badge
                                                variant={page.is_published ? 'default' : 'secondary'}
                                                className="text-[10px]"
                                            >
                                                {page.is_published ? 'Published' : 'Unpublished'}
                                            </Badge>
                                            {page.has_draft && (
                                                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
                                                    Draft pending
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-1.5">
                                        <div className="flex items-center gap-2">
                                            {site && (
                                                <>
                                                    <a
                                                        href={clientPageUrl({ siteSlug: site.slug, slug: page.slug, category: page.category })}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                                                        title="Live"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                    {page.has_draft && (
                                                        <a
                                                            href={clientPageUrl({ siteSlug: site.slug, slug: page.slug, category: page.category, preview: true })}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:opacity-80"
                                                            title="Preview draft"
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </a>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {sites.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs gap-2">
                    <FileText className="h-4 w-4" />
                    No sites in the fleet yet.
                </div>
            )}
        </div>
    );
}
