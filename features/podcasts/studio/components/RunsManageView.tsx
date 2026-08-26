"use client";

// features/podcasts/studio/components/RunsManageView.tsx
//
// The studio manage grid: every podcast run the user has started, read from the
// durable agent_run record (GET /podcast/runs). Filter by state, see the source
// that went into each, correct heartbeat-based status, and jump to the run or
// its episode. Replaces the old pc_studio_runs-backed run list.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  ExternalLink,
  Mic,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraSection,
  type ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { useStudioRuns } from "@/features/podcasts/studio/runs/useStudioRuns";
import {
  isNonTerminal,
  type RunSummary,
} from "@/features/podcasts/studio/runs/run-types";
import { trueSummaryLiveness } from "@/features/podcasts/studio/runs/run-truth";
import { deletePodcastRun } from "@/features/podcasts/studio/runs/runsRepository";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { toast } from "@/lib/toast";
import { RunHistoryCard, runEditHref, runHistoryHref } from "./RunHistoryCard";

type FilterKey = "all" | "active" | "completed" | "failed" | "draft";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "completed", label: "Ready" },
  { key: "failed", label: "Failed" },
  { key: "draft", label: "Drafts" },
];

function matches(run: RunSummary, key: FilterKey): boolean {
  // Filter on the TRUE status (see runs/run-truth.ts) — a run whose episode
  // exists belongs under Completed even if its status column never got written.
  const liveness = trueSummaryLiveness(run);
  switch (key) {
    case "all":
      return true;
    case "active":
      return isNonTerminal(liveness);
    case "completed":
      return liveness === "completed";
    case "failed":
      return liveness === "failed";
    case "draft":
      return liveness === "draft";
  }
}

const RUN_DOM_ATTR = "data-podcast-run-id";

function runContext(run: RunSummary): string {
  const status = trueSummaryLiveness(run);
  const title = run.title || "Untitled episode";
  return [
    `Podcast run: ${title}`,
    `Status: ${status}`,
    `Source: ${run.source.summary || run.source.input_data_type || "Unknown"}`,
    `Progress: ${run.stage_progress.done}/${run.stage_progress.total} steps`,
  ].join("\n");
}

export function RunsManageView({
  getSurfaceScope,
}: {
  getSurfaceScope: () => ApplicationScope;
}) {
  const { runs, loading, error, refresh } = useStudioRuns();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [menuRun, setMenuRun] = useState<RunSummary | null>(null);
  const menuRunRef = useRef<RunSummary | null>(null);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: runs.length,
      active: 0,
      completed: 0,
      failed: 0,
      draft: 0,
    };
    for (const r of runs) {
      const liveness = trueSummaryLiveness(r);
      if (isNonTerminal(liveness)) c.active += 1;
      else if (liveness === "completed") c.completed += 1;
      else if (liveness === "failed") c.failed += 1;
      else if (liveness === "draft") c.draft += 1;
    }
    return c;
  }, [runs]);

  const filtered = useMemo(
    () => runs.filter((r) => matches(r, filter)),
    [runs, filter],
  );

  const handleDeleteRun = async (run: RunSummary) => {
    const title = run.title || "Untitled episode";
    const ok = await confirm({
      title: "Delete this run?",
      description: `“${title}” will be removed from Studio history. A published episode, if one exists, stays available.`,
      confirmLabel: "Delete run",
      variant: "destructive",
    });
    if (!ok) return;

    setDeletingRunId(run.run_id);
    try {
      await deletePodcastRun(run.run_id);
      await refresh();
      toast.success("Run deleted");
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Couldn’t delete the run",
      );
    } finally {
      setDeletingRunId(null);
    }
  };

  const resolveMenuTarget = (
    target: HTMLElement | null,
  ): ResolvedContextMenuContext | null => {
    const runId = target
      ?.closest?.(`[${RUN_DOM_ATTR}]`)
      ?.getAttribute(RUN_DOM_ATTR);
    const run = runId
      ? (runs.find((item) => item.run_id === runId) ?? null)
      : null;
    menuRunRef.current = run;
    setMenuRun(run);
    if (!run) return null;
    return {
      content: runContext(run),
      [CONTEXT_MENU_ENTITY_KEY]: {
        type: "agent_run",
        id: run.run_id,
        title: run.title || "Untitled episode",
      },
    };
  };

  const menuSections: ContextMenuExtraSection[] = menuRun
    ? [
        {
          id: "podcast-run-actions",
          label: "Run",
          icon: AudioLines,
          anchor: "after-clipboard",
          items: [
            {
              kind: "link",
              id: "podcast-run-open",
              label: "Open",
              icon: ExternalLink,
              href: runHistoryHref(menuRun),
            },
            {
              kind: "link",
              id: "podcast-run-edit",
              label:
                trueSummaryLiveness(menuRun) === "completed"
                  ? "Edit episode"
                  : "Review run",
              icon: Pencil,
              href: runEditHref(menuRun),
            },
            { kind: "separator", id: "podcast-run-delete-separator" },
            {
              kind: "item",
              id: "podcast-run-delete",
              label: "Delete run",
              icon: Trash2,
              destructive: true,
              disabled: deletingRunId === menuRun.run_id,
              onSelect: () => void handleDeleteRun(menuRun),
            },
          ],
        },
      ]
    : [];

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your runs
        </h2>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Refresh runs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      {!loading && runs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => {
            const n = counts[key];
            if (key !== "all" && n === 0) return null;
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load your runs: {error}
        </div>
      )}

      <NonEditableContextMenu
        sourceFeature="podcasts"
        surfaceName="matrx-user/podcast"
        menuVersion={1}
        contentSource={{ type: "raw" }}
        resolveContextOnOpen={resolveMenuTarget}
        getApplicationScope={() => {
          const run = menuRunRef.current;
          const selection = window.getSelection();
          return buildApplicationScopeFromMenuContext({
            selectedText: selection ? selection.toString() : "",
            selectionRange: null,
            contextData: {
              ...getSurfaceScope(),
              content: run ? runContext(run) : "Podcast Studio run history",
              context: run
                ? {
                    run_id: run.run_id,
                    status: trueSummaryLiveness(run),
                    episode_id: run.episode_id,
                  }
                : {},
            },
          });
        }}
        extraSections={menuSections}
      >
        <div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-square w-full rounded-xl" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mic className="h-7 w-7" />
              </span>
              <div className="space-y-1">
                <p className="font-medium text-foreground">No runs yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Your first episode is a topic away. Generate one and watch it
                  come to life in real time — every run is saved here, source
                  and all.
                </p>
              </div>
              <Button asChild className="gap-2">
                <Link href="/podcast/studio/create">
                  <AudioLines className="h-4 w-4" />
                  Create your first episode
                </Link>
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
              No runs match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {filtered.map((run) => (
                <RunHistoryCard
                  key={run.run_id}
                  run={run}
                  deleting={deletingRunId === run.run_id}
                  onDelete={(selectedRun) => void handleDeleteRun(selectedRun)}
                />
              ))}
            </div>
          )}
        </div>
      </NonEditableContextMenu>
    </section>
  );
}
