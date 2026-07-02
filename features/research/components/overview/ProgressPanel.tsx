'use client';

import { useRef, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Search, Download, Brain, Layers, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PIPELINE_STEPS } from '../../constants';
import type { ResearchStreamStep } from '../../types';
import type { StreamMessage } from '../../hooks/useResearchStream';

export interface LiveStats {
    sourcesFound: number;
    scraped: number;
    scrapeGood: number;
    analyzed: number;
    analysisFailed: number;
}

const STEP_ICONS: Record<string, typeof Search> = {
    searching: Search,
    scraping: Download,
    analyzing: Brain,
    synthesizing: Layers,
    reporting: FileText,
};

interface ProgressPanelProps {
    isStreaming: boolean;
    currentStep: ResearchStreamStep | null;
    messages: StreamMessage[];
    error: string | null;
    liveStats?: LiveStats;
    onClose: () => void;
    onCancel: () => void;
}

export function ProgressPanel({ isStreaming, currentStep, messages, error, liveStats, onClose, onCancel }: ProgressPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    if (!isStreaming && !currentStep && messages.length === 0) return null;

    const isComplete = currentStep === 'complete';
    const isError = currentStep === 'error';
    const hasLiveStats = liveStats && (
        liveStats.sourcesFound > 0 ||
        liveStats.scraped > 0 ||
        liveStats.analyzed > 0
    );

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
                <div className="flex items-center gap-2">
                    {isStreaming && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {isError && <AlertCircle className="h-4 w-4 text-destructive" />}
                    <span className="text-sm font-semibold">
                        {isStreaming ? 'Running Research Pipeline...' : isComplete ? 'Pipeline Complete' : isError ? 'Pipeline Error' : 'Pipeline Progress'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {isStreaming && (
                        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs">
                            Cancel
                        </Button>
                    )}
                    {!isStreaming && (
                        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-full">
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center gap-1 px-4 py-2 bg-muted/30 overflow-x-auto">
                {PIPELINE_STEPS.map((step, i) => {
                    const Icon = STEP_ICONS[step.key] ?? Search;
                    const stepIdx = PIPELINE_STEPS.findIndex(s => s.key === currentStep);
                    const thisIdx = i;
                    const isDone = isComplete || thisIdx < stepIdx;
                    const isActive = step.key === currentStep;

                    return (
                        <div key={step.key} className="flex items-center gap-1">
                            <div className={cn(
                                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                                isActive ? 'bg-primary text-primary-foreground' :
                                isDone ? 'bg-primary/20 text-primary' :
                                'bg-muted text-muted-foreground',
                            )}>
                                <Icon className="h-3 w-3" />
                                <span className="hidden sm:inline">{step.label}</span>
                            </div>
                            {i < PIPELINE_STEPS.length - 1 && (
                                <div className={cn('h-px w-3 sm:w-6', isDone ? 'bg-primary/40' : 'bg-border')} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Live Stats Bar — real-time counters from data events */}
            {hasLiveStats && liveStats && (
                <div className="flex items-center gap-4 px-4 py-2 border-b border-border/50 bg-muted/20 text-[10px] text-muted-foreground flex-wrap">
                    {liveStats.sourcesFound > 0 && (
                        <span className="flex items-center gap-1">
                            <Search className="h-3 w-3 text-blue-400" />
                            <span className="tabular-nums font-medium text-foreground">{liveStats.sourcesFound}</span> sources found
                        </span>
                    )}
                    {liveStats.scraped > 0 && (
                        <span className="flex items-center gap-1">
                            <Download className="h-3 w-3 text-green-400" />
                            <span className="tabular-nums font-medium text-foreground">{liveStats.scrapeGood}/{liveStats.scraped}</span> scraped
                        </span>
                    )}
                    {liveStats.analyzed > 0 && (
                        <span className="flex items-center gap-1">
                            <Brain className="h-3 w-3 text-purple-400" />
                            <span className="tabular-nums font-medium text-foreground">{liveStats.analyzed}</span> analyzed
                            {liveStats.analysisFailed > 0 && (
                                <span className="text-destructive/70">({liveStats.analysisFailed} failed)</span>
                            )}
                        </span>
                    )}
                </div>
            )}

            {/* Messages Log */}
            <div ref={scrollRef} className="max-h-48 overflow-y-auto p-3 space-y-1.5">
                {messages.map(msg => (
                    <div key={msg.id} className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="text-foreground">{msg.message}</span>
                    </div>
                ))}
                {error && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
