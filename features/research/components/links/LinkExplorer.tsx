'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ExternalLink, Plus, Loader2, Link2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useTopicContext } from '../../context/ResearchContext';
import { useResearchApi } from '../../hooks/useResearchApi';
import type { ExtractedLink } from '../../types';

export default function LinkExplorer() {
    const { topicId, refresh } = useTopicContext();
    const api = useResearchApi();
    const [links, setLinks] = useState<ExtractedLink[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        api.getLinks(topicId)
            .then(res => res.json())
            .then((data: ExtractedLink[]) => {
                if (!cancelled) setLinks(data);
            })
            .catch(() => {
                if (!cancelled) setLinks([]);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [api, topicId]);

    const refetch = useCallback(() => {
        api.getLinks(topicId)
            .then(res => res.json())
            .then((data: ExtractedLink[]) => setLinks(data))
            .catch(() => setLinks([]));
    }, [api, topicId]);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [adding, setAdding] = useState(false);

    const linkList = (links as ExtractedLink[]) ?? [];

    const filtered = useMemo(() => {
        if (!search) return linkList;
        const q = search.toLowerCase();
        return linkList.filter(l =>
            l.url.toLowerCase().includes(q) ||
            (l.link_text ?? '').toLowerCase().includes(q) ||
            (l.found_on_title ?? '').toLowerCase().includes(q) ||
            (l.found_on_url ?? '').toLowerCase().includes(q),
        );
    }, [linkList, search]);

    const toggleSelect = useCallback((url: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url); else next.add(url);
            return next;
        });
    }, []);

    const handleAddToScope = useCallback(async (urls?: string[]) => {
        const urlsToAdd = urls || [...selected];
        if (urlsToAdd.length === 0) return;
        setAdding(true);
        try {
            await api.addLinksToScope(topicId, { urls: urlsToAdd });
            setSelected(new Set());
            refetch();
            refresh();
        } finally {
            setAdding(false);
        }
    }, [api, topicId, selected, refetch, refresh]);

    return (
        <div className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
                <span className="text-xs font-medium text-foreground/80">Links</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{filtered.length}/{linkList.length}</span>
                <div className="flex-1 relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search url, text, source..."
                        className="w-full h-6 pl-7 pr-2 text-[11px] rounded-full matrx-glass-card border-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                        style={{ fontSize: '16px' }}
                    />
                </div>
                {selected.size > 0 && (
                    <button
                        onClick={() => handleAddToScope()}
                        disabled={adding}
                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full matrx-glass-card text-[11px] font-medium text-primary disabled:opacity-50 transition-colors shrink-0"
                    >
                        {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Add {selected.size}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-xs">Loading links...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center px-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
                        <Link2 className="h-6 w-6 text-primary/40" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-foreground/70">
                            {linkList.length === 0 ? 'No links yet' : 'No matches'}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
                            {linkList.length === 0
                                ? 'Links are automatically extracted from pages when you scrape your sources.'
                                : 'Try adjusting your search to find what you\'re looking for.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {filtered.map((link, i) => (
                        <div key={`${link.url}-${i}`} className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-2.5">
                            <Checkbox
                                checked={selected.has(link.url)}
                                onCheckedChange={() => toggleSelect(link.url)}
                                className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-primary hover:underline flex items-center gap-1 break-all"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {link.link_text || link.url}
                                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                </a>
                                {link.link_text && (
                                    <div className="text-[10px] text-muted-foreground truncate mt-px">{link.url}</div>
                                )}
                                {link.found_on_title && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                        from: {link.found_on_title}
                                    </div>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddToScope([link.url])}
                                disabled={adding}
                                className="shrink-0 h-7 w-7 p-0"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
