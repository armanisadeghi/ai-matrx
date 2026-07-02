'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw, Loader2, AlertCircle, Layers } from 'lucide-react';
import Link from 'next/link';
import { useResearchApi } from '../../hooks/useResearchApi';
import { useResearchTags, useResearchSynthesis } from '../../hooks/useResearchState';
import { useResearchStream } from '../../hooks/useResearchStream';
import { useStreamDebug } from '../../context/ResearchContext';
import MarkdownStream from '@/components/MarkdownStream';
import { ContentActionBar } from '@/components/content-actions/ContentActionBar';
import { StoppedEarlyNote } from '../shared/StoppedEarlyNote';
import type { ResearchSynthesis, ResearchDataEvent } from '../../types';

interface ConsolidationViewProps {
    topicId: string;
    tagId: string;
}

/** A string with real (non-whitespace) content. */
const hasText = (s: string | null | undefined): s is string => !!s && s.trim().length > 0;

/** Render structured JSON output as a fenced code block — bounded + crash-safe. */
const structuredToMarkdown = (data: unknown): string => {
    try {
        const s = JSON.stringify(data, null, 2);
        const clipped = s.length > 20000 ? `${s.slice(0, 20000)}\n… (truncated)` : s;
        return `\`\`\`json\n${clipped}\n\`\`\``;
    } catch {
        return '_Structured output could not be displayed._';
    }
};

/**
 * Renders a tag's consolidation — the synthesis the backend persists to
 * `rs_synthesis` with `scope="tag"` when `api.consolidateTag` runs. This is a
 * paid LLM call, so its output must always be shown honestly: live while
 * streaming, the persisted result on load, an explicit empty/failed state
 * when there is nothing — never a perpetual placeholder.
 */
export default function ConsolidationView({ topicId, tagId }: ConsolidationViewProps) {
    const api = useResearchApi();
    const debug = useStreamDebug();
    const stream = useResearchStream();
    const { data: tags } = useResearchTags(topicId);
    const { data: tagSyntheses, refresh: refetch } = useResearchSynthesis(topicId, { scope: 'tag' });
    const [streamingText, setStreamingText] = useState('');

    const tag = tags?.find((t) => t.id === tagId);

    // The current consolidation for this tag (newest current row wins; fall back
    // to any row for the tag if none is flagged current).
    const consolidation = useMemo<ResearchSynthesis | null>(() => {
        const list = (tagSyntheses ?? []) as ResearchSynthesis[];
        const forTag = list.filter((s) => s.tag_id === tagId);
        return forTag.find((s) => s.is_current) ?? forTag[0] ?? null;
    }, [tagSyntheses, tagId]);

    const consolidating = stream.isStreaming;

    const handleConsolidate = useCallback(async () => {
        if (consolidating) return;
        setStreamingText('');
        const response = await api.consolidateTag(topicId, tagId);
        stream.startStream(response, {
            onChunk: (text) => setStreamingText((prev) => prev + text),
            onData: (payload: ResearchDataEvent) => {
                if (payload.type === 'consolidate_complete' && payload.tag_id === tagId) {
                    // Stream only carries metadata — the full row is persisted to
                    // rs_synthesis. Refetch for the canonical content.
                    setStreamingText('');
                    refetch();
                }
            },
            onEnd: () => {
                setStreamingText('');
                refetch();
            },
        });
        debug.pushEvents(stream.rawEvents, 'consolidate');
    }, [api, topicId, tagId, stream, refetch, debug, consolidating]);

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
                    <span className="hidden sm:inline">{consolidation ? 'Re-consolidate' : 'Consolidate'}</span>
                </button>
            </div>

            {/* Live streaming while the consolidation LLM is writing */}
            {consolidating && streamingText && (
                <div className="rounded-xl border border-primary/30 bg-card/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                        <span className="text-xs font-medium text-primary">Consolidating {tag ? `“${tag.name}”` : 'tag'}…</span>
                    </div>
                    <div className="px-3 py-3">
                        <MarkdownStream content={streamingText} isStreamActive />
                    </div>
                </div>
            )}

            {/* Persisted consolidation (hidden while a fresh stream is writing) */}
            {!consolidating && (
                <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4">
                    {consolidation && hasText(consolidation.result) ? (
                        <div className="space-y-2">
                            {consolidation.status === 'failed' && (
                                <StoppedEarlyNote reason={consolidation.error || 'Consolidation stopped early.'} />
                            )}
                            <MarkdownStream content={consolidation.result} />
                            <div className="flex justify-end">
                                <ContentActionBar
                                    content={consolidation.result}
                                    title={tag ? `${tag.name} — consolidation` : 'Tag consolidation'}
                                    instanceKey={`consolidation-${consolidation.id}`}
                                    metadata={{
                                        consolidationId: consolidation.id,
                                        tagId,
                                        version: consolidation.version ?? undefined,
                                        model_id: consolidation.model_id ?? undefined,
                                    }}
                                />
                            </div>
                        </div>
                    ) : consolidation && consolidation.result_structured ? (
                        <div className="space-y-2">
                            {consolidation.status === 'failed' && (
                                <StoppedEarlyNote reason={consolidation.error || 'Consolidation stopped early.'} />
                            )}
                            <MarkdownStream content={structuredToMarkdown(consolidation.result_structured)} />
                        </div>
                    ) : consolidation && consolidation.error ? (
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 text-xs text-destructive">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            {consolidation.error}
                        </div>
                    ) : consolidation ? (
                        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>This consolidation completed but produced no text output. Re-consolidate to regenerate it.</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                            <div className="h-11 w-11 rounded-2xl bg-primary/8 flex items-center justify-center">
                                <Layers className="h-5 w-5 text-primary/40" />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-foreground/70">No consolidation yet</p>
                                <p className="text-[11px] text-muted-foreground mt-1 max-w-[280px]">
                                    Consolidation synthesizes every source assigned to{' '}
                                    {tag ? `“${tag.name}”` : 'this tag'} into one cohesive view. Run it to generate.
                                </p>
                            </div>
                            <button
                                onClick={handleConsolidate}
                                disabled={consolidating}
                                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
                            >
                                <RefreshCw className="h-3 w-3" />
                                Consolidate
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
