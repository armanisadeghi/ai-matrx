"use client";

/**
 * features/page-extraction/data-review/RunsPopover.tsx
 *
 * Run history for one dataset: pick which run to view (or "All runs"), cancel
 * an in-flight run, and retry individual failed chunks. Surfaces the
 * previously UI-less `listRunsForJob` / `cancelRun` / `retryPageRun` APIs.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  History,
  Loader2,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";

import {
  deleteRun,
  listPageRunsForRun,
  listRunsForJob,
} from "@/features/page-extraction/api/runs";
import { cancelRun, retryPageRun } from "@/features/page-extraction/api/stream";
import type {
  PageExtractionPageRun,
  PageExtractionRun,
} from "@/features/page-extraction/types";

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  running: "bg-blue-500 animate-pulse",
  queued: "bg-amber-500",
  failed: "bg-red-500",
  cancelled: "bg-zinc-400",
};

export function RunsPopover({
  jobId,
  selectedRunId,
  onSelectRun,
  onChanged,
}: {
  jobId: string;
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<PageExtractionRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageRuns, setPageRuns] = useState<PageExtractionPageRun[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await listRunsForJob(jobId));
    } catch (e) {
      toast.error("Could not load runs", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const expand = useCallback(
    async (runId: string) => {
      setExpanded((cur) => (cur === runId ? null : runId));
      if (expanded === runId) return;
      try {
        setPageRuns(await listPageRunsForRun(runId));
      } catch {
        setPageRuns([]);
      }
    },
    [expanded],
  );

  const doCancel = useCallback(
    async (runId: string) => {
      setBusy(runId);
      try {
        await cancelRun(runId);
        toast.success("Run cancelled");
        await load();
        onChanged();
      } catch (e) {
        toast.error("Could not cancel run", {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setBusy(null);
      }
    },
    [load, onChanged],
  );

  const doDelete = useCallback(
    async (run: PageExtractionRun, num: number) => {
      const ok = await confirm({
        title: `Delete run #${num}`,
        description:
          "Permanently delete this entire run — its chunk runs and all " +
          run.result_count +
          " result row" +
          (run.result_count === 1 ? "" : "s") +
          " it produced. The dataset's other runs stay. This cannot be undone.",
        confirmLabel: "Delete run",
        variant: "destructive",
      });
      if (!ok) return;
      setBusy(run.id);
      try {
        await deleteRun(run.id);
        // If we were viewing the deleted run, fall back to "All runs".
        if (selectedRunId === run.id) onSelectRun(null);
        toast.success("Run deleted");
        await load();
        onChanged();
      } catch (e) {
        toast.error("Could not delete run", {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setBusy(null);
      }
    },
    [load, onChanged, onSelectRun, selectedRunId],
  );

  const doRetry = useCallback(
    async (pageRunId: string) => {
      setBusy(pageRunId);
      try {
        await retryPageRun(pageRunId);
        toast.success("Chunk retry queued");
        onChanged();
      } catch (e) {
        toast.error("Could not retry chunk", {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const label =
    selectedRunId === null
      ? "All runs"
      : `Run ${runs.findIndex((r) => r.id === selectedRunId) >= 0 ? "#" + (runs.length - runs.findIndex((r) => r.id === selectedRunId)) : ""}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{label}</span>
          <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Run history
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => {
              onSelectRun(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent",
              selectedRunId === null && "bg-accent",
            )}
          >
            <span>All runs (accumulated)</span>
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : runs.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No runs yet.
            </div>
          ) : (
            runs.map((run, i) => {
              const num = runs.length - i;
              const isActive = selectedRunId === run.id;
              return (
                <div key={run.id} className="rounded">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 text-sm",
                      isActive && "bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        STATUS_DOT[run.status] ?? "bg-zinc-400",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onSelectRun(run.id);
                        setOpen(false);
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium">Run #{num}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {run.result_count} rows · {run.completed_chunks}/
                        {run.chunk_count} chunks
                        {run.failed_chunks > 0 &&
                          ` · ${run.failed_chunks} failed`}
                      </div>
                    </button>
                    {run.status === "running" || run.status === "queued" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Cancel run"
                        disabled={busy === run.id}
                        onClick={() => void doCancel(run.id)}
                      >
                        {busy === run.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    ) : (
                      <>
                        {run.failed_chunks > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="View failed chunks"
                            onClick={() => void expand(run.id)}
                          >
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform",
                                expanded === run.id && "rotate-180",
                              )}
                            />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Delete this entire run (chunks + results)"
                          disabled={busy === run.id}
                          onClick={() => void doDelete(run, num)}
                        >
                          {busy === run.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>

                  {expanded === run.id && (
                    <div className="ml-4 border-l border-border pl-2">
                      {pageRuns
                        .filter((pr) => pr.status === "failed")
                        .map((pr) => (
                          <div
                            key={pr.id}
                            className="flex items-center gap-2 py-1 text-xs"
                          >
                            <XCircle className="h-3 w-3 shrink-0 text-red-500" />
                            <span className="flex-1 truncate text-muted-foreground">
                              Chunk {pr.chunk_index + 1} · p{" "}
                              {pr.page_numbers.join(", ")}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              title="Retry chunk"
                              disabled={busy === pr.id}
                              onClick={() => void doRetry(pr.id)}
                            >
                              {busy === pr.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ))}
                      {pageRuns.filter((pr) => pr.status === "failed")
                        .length === 0 && (
                        <div className="flex items-center gap-1 py-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />{" "}
                          No failed chunks
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
