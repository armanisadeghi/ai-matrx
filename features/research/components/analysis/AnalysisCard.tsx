"use client";

import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import MarkdownStream from "@/components/markdown";
import { useResearchApi } from "../../hooks/useResearchApi";
import { type ResearchAnalysis, tokenUsageFromJson } from "../../types";

interface AnalysisCardProps {
  analysis: ResearchAnalysis | null;
  topicId?: string;
  sourceId?: string;
  contentId?: string;
  onAnalyzed?: () => void;
  /** Live token stream text while an analysis is being generated */
  streamingText?: string;
  /** When true, renders only a compact "Re-analyze" trigger button (no card UI) */
  triggerOnly?: boolean;
}

export function AnalysisCard({
  analysis,
  topicId,
  sourceId,
  contentId,
  onAnalyzed,
  streamingText,
  triggerOnly,
}: AnalysisCardProps) {
  const api = useResearchApi();
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!topicId || !analysis) return;
    setRetrying(true);
    try {
      await api.retryAnalysis(topicId, analysis.id);
      onAnalyzed?.();
    } finally {
      setRetrying(false);
    }
  }, [api, topicId, analysis, onAnalyzed]);

  // Compact trigger-only mode — used in the section header when analyses already exist
  if (triggerOnly) {
    return (
      <button
        onClick={onAnalyzed}
        disabled={!topicId || !sourceId}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors",
          "disabled:opacity-40 disabled:pointer-events-none",
        )}
      >
        <Plus className="h-3 w-3" />
        Re-analyze
      </button>
    );
  }

  // Live streaming — analysis is generating right now
  if (streamingText !== undefined && streamingText !== "") {
    return (
      <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
          <span className="text-xs font-medium text-primary">Analyzing…</span>
          <span className="text-[10px] text-muted-foreground">
            tokens streaming
          </span>
        </div>
        <div className="px-4 py-3">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <MarkdownStream content={streamingText} isStreamActive />
          </div>
          {/* Blinking cursor */}
          <span className="inline-block w-0.5 h-3.5 bg-primary animate-pulse ml-0.5 align-middle" />
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm min-h-[180px] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
          <Brain className="h-5 w-5 text-primary/60" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground/70">
            No analysis yet
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px]">
            Run AI analysis to extract insights, key topics, and a summary from
            this content.
          </p>
        </div>
        <button
          onClick={onAnalyzed}
          disabled={!topicId || !sourceId}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium transition-all min-h-[44px]",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          <Brain className="h-3 w-3" />
          Analyze
        </button>
      </div>
    );
  }

  const isFailed = analysis.status === "failed";
  const tokenUsage = tokenUsageFromJson(analysis.token_usage);

  // Failed analysis — show error state with retry
  if (isFailed) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-destructive">
                  Analysis failed
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {analysis.agent_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(analysis.created_at).toLocaleDateString()}
                </span>
              </div>
              {analysis.error && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {analysis.error}
                </p>
              )}
            </div>
          </div>
          {topicId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={retrying}
              className="gap-1.5 shrink-0 border-destructive/40 hover:border-destructive text-destructive hover:text-destructive min-h-[44px] sm:min-h-0"
            >
              {retrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Successful analysis
  const createdAt = new Date(analysis.created_at);
  const formattedDate = createdAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = createdAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Brain className="h-4 w-4 text-primary shrink-0" />
          <Badge variant="secondary" className="text-[10px]">
            {analysis.agent_type}
          </Badge>
          {analysis.model_id && (
            <span className="text-xs text-muted-foreground truncate">
              {analysis.model_id}
            </span>
          )}
          <span
            className="text-xs text-muted-foreground tabular-nums"
            title={`${formattedDate} at ${formattedTime}`}
          >
            {formattedDate}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
            {formattedTime}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
      </button>

      {!expanded && analysis.result && (
        <div className="px-4 pb-3 text-xs text-muted-foreground line-clamp-2">
          {analysis.result.slice(0, 200)}
        </div>
      )}

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {analysis.result ?? ""}
            </ReactMarkdown>
          </div>

          {tokenUsage && (
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t border-border pt-2">
              {tokenUsage.input_tokens != null && (
                <span>In: {tokenUsage.input_tokens.toLocaleString()}</span>
              )}
              {tokenUsage.output_tokens != null && (
                <span>Out: {tokenUsage.output_tokens.toLocaleString()}</span>
              )}
              {tokenUsage.estimated_cost != null && (
                <span>${tokenUsage.estimated_cost.toFixed(4)}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
