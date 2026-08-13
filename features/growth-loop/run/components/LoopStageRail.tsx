"use client";

/**
 * The twelve stages of one loop, in order, with the loop's position on them.
 *
 * The stage vocabulary, the plain-English titles and the icons all come from
 * `../../map/loop-map.ts` — the ONE place the loop's stages are declared. This
 * component adds no stage names of its own; a stage renamed in the map renames
 * here, and a stage added to the server's `LoopStage` enum without a map entry
 * is a compile error at `STAGE_CARDS`.
 */

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleDashed,
  Loader2,
  Pause,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { STAGES } from "../../map/loop-map";
import { stageIcon } from "../../public/stage-icons";
import { resolveStageEntry, type RefSubject } from "../stage-doors";
import type { LoopStageId, LoopStateView } from "../api";

const STAGE_CARDS = STAGES.map((stage) => ({
  id: stage.id as LoopStageId,
  title: stage.publicInfo?.title ?? stage.label,
  plain: stage.publicInfo?.plain ?? stage.blurb,
  Icon: stageIcon(stage.publicInfo?.icon ?? ""),
}));

export type StageDisplayState = "done" | "current" | "blocked" | "upcoming";

function stateFor(index: number, loop: LoopStateView): StageDisplayState {
  const currentIndex = loop.stage_position - 1;
  if (index < currentIndex) return "done";
  if (index > currentIndex) return "upcoming";
  return loop.is_blocked ? "blocked" : "current";
}

const STATE_BADGE: Record<
  StageDisplayState,
  { label: string; className: string }
> = {
  done: {
    label: "Done",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  current: {
    label: "Working on it",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  blocked: {
    label: "Needs you",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  upcoming: {
    label: "Not started",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

function StateIcon({ state }: { state: StageDisplayState }) {
  if (state === "done") return <Check className="h-3.5 w-3.5" aria-hidden />;
  if (state === "current")
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
  if (state === "blocked")
    return <TriangleAlert className="h-3.5 w-3.5" aria-hidden />;
  return <CircleDashed className="h-3.5 w-3.5" aria-hidden />;
}

export function LoopStageRail({
  loop,
  subject,
}: {
  loop: LoopStateView;
  subject: RefSubject;
}) {
  const paused = loop.status === "paused";

  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {STAGE_CARDS.map((card, index) => {
        const state = stateFor(index, loop);
        const badge = STATE_BADGE[state];
        // On a later cycle, everything ahead of the pointer was completed in
        // the round before — saying "Not started" there would be a lie.
        const badgeLabel =
          state === "upcoming" && loop.cycle > 1 ? "Done last round" : badge.label;
        const entry = resolveStageEntry(card.id, subject);
        const isCurrent = state === "current" || state === "blocked";

        return (
          <li
            key={card.id}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3",
              isCurrent ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
              state === "upcoming" && "opacity-70",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  isCurrent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <card.Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {index + 1}. {card.title}
              </span>
              <span
                className={cn(
                  "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  badge.className,
                )}
              >
                {isCurrent && paused ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <StateIcon state={state} />
                )}
                {isCurrent && paused ? "Paused" : badgeLabel}
              </span>
            </div>

            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
              {card.plain}
            </p>

            {entry && (
              <Link
                href={entry}
                className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open where you do this
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
