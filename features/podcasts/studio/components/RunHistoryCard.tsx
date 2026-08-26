"use client";

// features/podcasts/studio/components/RunHistoryCard.tsx
//
// One card in the studio manage grid, backed by the durable agent_run record
// (RunSummary). Shows the SOURCE the user fed in, a heartbeat-accurate status,
// stage progress, and links to the most useful destination for the run's state:
// a completed run with a published episode opens the episode; everything else
// opens the run detail / recovery page.

import Link from "next/link";
import { useRef } from "react";
import {
  Mic,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FileText,
  MoreHorizontal,
  Pencil,
  PauseCircle,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompactConfirmAnchorPoint } from "@/components/ui/compact-confirm-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import {
  livenessLabel,
  sourceLabel,
  type RunLiveness,
  type RunSummary,
} from "@/features/podcasts/studio/runs/run-types";
import { trueSummaryLiveness } from "@/features/podcasts/studio/runs/run-truth";

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
  const liveness = trueSummaryLiveness(run);
  if (liveness === "completed") return null;
  if (liveness === "draft") return "Not started";
  if (total > 0) {
    const base = `${done}/${total} steps`;
    if (liveness === "failed" && failed === 0) return `${base} · run failed`;
    return failed > 0 ? `${base} · ${failed} failed` : base;
  }
  return failed > 0 ? `${failed} failed` : null;
}

export function runHistoryHref(run: RunSummary): string {
  return trueSummaryLiveness(run) === "completed" && run.episode_slug
    ? `/podcast/${run.episode_slug}`
    : `/podcast/studio/run/${run.run_id}`;
}

export function runEditHref(run: RunSummary): string {
  return `/podcast/studio/run/${run.run_id}`;
}

export function RunHistoryCard({
  run,
  deleting = false,
  onDelete,
}: {
  run: RunSummary;
  deleting?: boolean;
  onDelete: (run: RunSummary, anchorPoint: CompactConfirmAnchorPoint) => void;
}) {
  const deleteAnchorRef = useRef<CompactConfirmAnchorPoint | null>(null);
  // Completed + published → straight to the episode (most useful). Otherwise the
  // run detail / recovery page (Wave 2 makes interrupted runs resumable there).
  // TRUE status (runs/run-truth.ts) — a finished run whose status column was
  // never written still gets its episode chip and its episode link.
  const liveness = trueSummaryLiveness(run);
  const href = runHistoryHref(run);
  const editHref = runEditHref(run);
  const cover = run.cover_file_id ?? run.cover_url ?? null;
  const prog = progressLabel(run);
  const title = run.title || "Untitled episode";

  return (
    <article
      data-podcast-run-id={run.run_id}
      className="group relative flex overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md"
    >
      <Link href={href} className="flex min-w-0 flex-1 flex-col">
        <div className="relative aspect-square w-full bg-muted">
          <InlineMediaRef
            ref={cover}
            size="fill"
            fit="cover"
            alt={title}
            fallbackIcon={<Mic className="h-7 w-7 text-primary/50" />}
          />
          <span className="absolute right-2 top-2">
            <StatusChip liveness={liveness} />
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
            {title}
          </p>
          <p
            className="line-clamp-1 text-xs text-muted-foreground"
            title={sourceLabel(run.source)}
          >
            {sourceLabel(run.source)}
          </p>
          {prog && (
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground/80">
              {prog}
            </p>
          )}
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={deleting}
            aria-label={`${title} actions`}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              deleteAnchorRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              };
            }}
            className="absolute left-1 top-1 z-20 h-11 w-11 rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/65 hover:text-white"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <Link href={href}>
              <Play className="mr-2 h-4 w-4" />
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={editHref}>
              <Pencil className="mr-2 h-4 w-4" />
              {liveness === "completed" ? "Edit episode" : "Review run"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={deleting}
            onSelect={() => {
              const anchorPoint = deleteAnchorRef.current;
              if (anchorPoint) onDelete(run, anchorPoint);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete run
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}
