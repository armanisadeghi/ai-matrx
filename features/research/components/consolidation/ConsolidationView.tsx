'use client';

import { useCallback, useState } from 'react';
import { ChevronLeft, RefreshCw, Loader2 } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useResearchApi } from '../../hooks/useResearchApi';
import { useResearchTags } from '../../hooks/useResearchState';
import type { ResearchTag, TagConsolidation } from '../../types';

interface ConsolidationViewProps {
    topicId: string;
    tagId: string;
}

export default function ConsolidationView({ topicId, tagId }: ConsolidationViewProps) {
    const api = useResearchApi();
    const [consolidating, setConsolidating] = useState(false);
    const { data: tags } = useResearchTags(topicId);

    const tag = tags?.find(t => t.id === tagId);

    const handleConsolidate = useCallback(async () => {
        setConsolidating(true);
        try {
            await api.consolidateTag(topicId, tagId);
        } finally {
            setConsolidating(false);
        }
    }, [api, topicId, tagId]);

    return (
        <div className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
                <Link href={`/research/topics/${topicId}/tags`} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="h-3 w-3" />
                    Tags
                </Link>
                {tag && (
                    <>
                        <span className="text-muted-foreground/30 text-[10px]">/</span>
                        <span className="text-xs font-medium text-foreground/80 truncate">{tag.name}</span>
                    </>
                )}
                <div className="flex-1" />
                <button
                    onClick={handleConsolidate}
                    disabled={consolidating}
                    className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full matrx-glass-card text-[11px] font-medium text-primary disabled:opacity-50 transition-colors"
                >
                    {consolidating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    <span className="hidden sm:inline">Re-consolidate</span>
                </button>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="text-muted-foreground text-sm">
                        Tag consolidation content will appear here after running consolidation.
                        Click &ldquo;Re-consolidate&rdquo; to generate or refresh the consolidated view.
                    </p>
                </div>
            </div>
        </div>
    );
}
