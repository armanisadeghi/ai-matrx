"use client";

import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BacklinkEnrichmentRunState } from "@/features/marketing/components/backlinks/lib/enrichment-run";
import { backlinkEnrichmentProgress } from "@/features/marketing/components/backlinks/lib/enrichment-run";

function shortSource(url: unknown): string {
  if (typeof url !== "string") return "Source page";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function BacklinkEnrichmentRunPanel({
  run,
  onDismiss,
}: {
  run: BacklinkEnrichmentRunState;
  onDismiss: () => void;
}) {
  const progress = backlinkEnrichmentProgress(run);
  const running = run.status === "running";
  const settled = run.completed + run.failed;

  return (
    <div className="shrink-0 px-3 pt-2 sm:px-4" aria-live="polite">
      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start gap-2">
          {running ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : run.status === "completed" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-foreground">
                {run.label}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {run.candidateCount > 0
                  ? `${settled} of ${run.candidateCount} settled`
                  : "Waiting for the queue…"}
                {run.completed > 0 ? ` · ${run.completed} analyzed` : ""}
                {run.failed > 0 ? ` · ${run.failed} failed` : ""}
              </p>
              {run.runId ? (
                <p
                  className="font-mono text-[10px] text-muted-foreground"
                  title={run.runId}
                >
                  Run {run.runId.slice(0, 8)}
                </p>
              ) : null}
            </div>
            <p
              className="mt-0.5 truncate text-xs text-muted-foreground"
              title={run.message}
            >
              {run.message}
            </p>
            {run.error ? (
              <p className="mt-1 text-xs text-destructive">{run.error}</p>
            ) : null}
            <Progress value={progress} className="mt-2 h-1.5" />
            {run.events.length > 0 ? (
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {run.events
                  .slice(-6)
                  .reverse()
                  .map((event, index) => (
                    <div
                      key={`${event.kind}-${event.backlink_id ?? index}-${index}`}
                      className="min-w-0 rounded border border-border/60 bg-muted/30 px-2 py-1"
                      title={
                        typeof event.source_url === "string"
                          ? event.source_url
                          : event.kind
                      }
                    >
                      <p className="truncate text-[10px] font-medium text-foreground">
                        {shortSource(
                          event.source_url ?? event.source_urls?.[0],
                        )}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {event.kind
                          .replace("seo.backlink_", "")
                          .replaceAll("_", " ")}
                      </p>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
          {!running ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label="Dismiss analysis progress"
              onClick={onDismiss}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
