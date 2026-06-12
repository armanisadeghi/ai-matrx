"use client";

// features/podcasts/studio/components/RunHistoryCard.tsx
//
// One card in the studio manage grid, backed by the durable agent_run record
// (RunSummary). Shows the SOURCE the user fed in, a heartbeat-accurate status,
// stage progress, and links to the most useful destination for the run's state:
// a completed run with a published episode opens the episode; everything else
// opens the run detail / recovery page.

import Link from "next/link";
import {
  Mic,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FileText,
  PauseCircle,
  XCircle,
} from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import {
  livenessLabel,
  sourceLabel,
  type RunLiveness,
  type RunSummary,
} from "@/features/podcasts/studio/runs/run-types";

function StatusChip({ liveness }: { liveness: RunLiveness }) {
  const base =
    "flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur";
  const icon =
    liveness === "completed" ? (
      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
    ) : liveness === "alive" ? (
      <Loader2 className="h-3 w-3 animate-spin text-primary" />
    ) : liveness === "stalled" ? (
      <PauseCircle className="h-3 w-3 text-amber-400" />
    ) : liveness === "failed" ? (
      <AlertTriangle className="h-3 w-3 text-red-400" />
    ) : liveness === "draft" ? (
      <FileText className="h-3 w-3 text-sky-300" />
    ) : (
      <XCircle className="h-3 w-3 text-muted-foreground" />
    );
  return (
    <span className={base}>
      {icon}
      {livenessLabel(liveness)}
    </span>
  );
}

function progressLabel(run: RunSummary): string | null {
  const { done, total, failed } = run.stage_progress;
  if (run.liveness === "completed") return null;
  if (run.liveness === "draft") return "Not started";
  if (total > 0) {
    const base = `${done}/${total} steps`;
    return failed > 0 ? `${base} · ${failed} failed` : base;
  }
  return failed > 0 ? `${failed} failed` : null;
}

export function RunHistoryCard({ run }: { run: RunSummary }) {
  // Completed + published → straight to the episode (most useful). Otherwise the
  // run detail / recovery page (Wave 2 makes interrupted runs resumable there).
  const href =
    run.liveness === "completed" && run.episode_slug
      ? `/podcast/${run.episode_slug}`
      : `/podcast/studio/run/${run.run_id}`;
  const cover = run.cover_file_id ?? run.cover_url ?? null;
  const prog = progressLabel(run);

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative aspect-square w-full bg-muted">
        <InlineMediaRef
          ref={cover}
          size="fill"
          fit="cover"
          alt={run.title || "Studio run"}
          fallbackIcon={<Mic className="h-7 w-7 text-primary/50" />}
        />
        <span className="absolute right-2 top-2">
          <StatusChip liveness={run.liveness} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {run.title || "Untitled episode"}
        </p>
        <p className="line-clamp-1 text-xs text-muted-foreground" title={sourceLabel(run.source)}>
          {sourceLabel(run.source)}
        </p>
        {prog && (
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground/80">
            {prog}
          </p>
        )}
      </div>
    </Link>
  );
}
