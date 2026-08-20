"use client";

// features/masterwork/browse/ApproachCard.tsx
//
// ONE Approach card, three consumers.
//
// Arman, 2026-08-20, looking at a Rulebook: "there were about twenty of these
// that I had named. Where are those ones? I wanna see all of them here. I
// wanna see cards for them. And if they're not available yet, then it needs to
// say coming soon."
//
// Before this file the card lived inside `intake/NewRulebookFlow.tsx` and
// existed nowhere else, so the Rulebook page had no way to show its Expert the
// Approaches and the module home hand-rolled a plainer tile. It is lifted here
// verbatim and consumed by:
//
//   1. intake/NewRulebookFlow.tsx  — step 2 of the guided start (selectable)
//   2. home/MasterworkHomePage.tsx — the "Start here" grid (links)
//   3. browse/ApproachPickerDialog.tsx — the Rulebook page's picker (launches)
//
// THE NO DEAD ENDS DOCTRINE decides interactivity, not `enabled`: a card is
// clickable exactly when the registry gives it somewhere to go (an
// `intake_query` lane or a `launch_href` page). A `coming_soon` Approach is a
// real, named, deliberately inert card — it says "Coming soon" and cannot be
// clicked into nothing.

import Link from "next/link";
import {
  Award,
  BookOpen,
  Check,
  Clock,
  Compass,
  Eye,
  FileText,
  Inbox,
  Layers,
  Lightbulb,
  MessageCircleQuestion,
  MessagesSquare,
  Mic,
  PenLine,
  ScanSearch,
  Shuffle,
  Target,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DistillationApproach } from "./approaches";

/** Static class maps so Tailwind sees every class it must emit. Exported
 *  because the intake flow's question tiles share the same accent family. */
export const ACCENT = {
  blue: {
    selected: "border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/30",
    iconSelected: "bg-blue-500 text-white",
    icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    check: "text-blue-500",
    hover: "hover:border-blue-500/40 hover:bg-blue-500/5",
  },
  amber: {
    selected: "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/30",
    iconSelected: "bg-amber-500 text-white",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    check: "text-amber-500",
    hover: "hover:border-amber-500/40 hover:bg-amber-500/5",
  },
  rose: {
    selected: "border-rose-500/60 bg-rose-500/5 ring-1 ring-rose-500/30",
    iconSelected: "bg-rose-500 text-white",
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    check: "text-rose-500",
    hover: "hover:border-rose-500/40 hover:bg-rose-500/5",
  },
  violet: {
    selected: "border-violet-500/60 bg-violet-500/5 ring-1 ring-violet-500/30",
    iconSelected: "bg-violet-500 text-white",
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    check: "text-violet-500",
    hover: "hover:border-violet-500/40 hover:bg-violet-500/5",
  },
  emerald: {
    selected: "border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/30",
    iconSelected: "bg-emerald-500 text-white",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    check: "text-emerald-500",
    hover: "hover:border-emerald-500/40 hover:bg-emerald-500/5",
  },
} as const;

/** Approach card presentation by registry key. Unknown keys (an Approach that
 *  reuses an existing lane is a ROW, not code) get the neutral fallback, so a
 *  new row always renders. */
const APPROACH_LOOK: Record<
  string,
  { icon: LucideIcon; accent: keyof typeof ACCENT }
> = {
  vision_interview: { icon: Lightbulb, accent: "emerald" },
  interview: { icon: Mic, accent: "violet" },
  source: { icon: FileText, accent: "blue" },
  exemplar: { icon: Award, accent: "amber" },
  body_of_work: { icon: BookOpen, accent: "amber" },
  file: { icon: Upload, accent: "rose" },
  monologue: { icon: Mic, accent: "rose" },
  chat_import: { icon: MessagesSquare, accent: "blue" },
  matrx_conversations: { icon: MessagesSquare, accent: "violet" },
  dump: { icon: Layers, accent: "blue" },
  oracle_tap: { icon: MessageCircleQuestion, accent: "emerald" },
  meeting_scavenger: { icon: ScanSearch, accent: "violet" },
  shadow_inbox: { icon: Inbox, accent: "blue" },
  red_pen: { icon: PenLine, accent: "rose" },
  bad_example_probe: { icon: Eye, accent: "amber" },
  triad_game: { icon: Shuffle, accent: "violet" },
  prediction_ledger: { icon: Target, accent: "emerald" },
};
const APPROACH_FALLBACK: { icon: LucideIcon; accent: keyof typeof ACCENT } = {
  icon: Compass,
  accent: "blue",
};

export interface ApproachCardProps {
  approach: DistillationApproach;
  /** Renders the selected treatment + a check (the intake picker). */
  selected?: boolean;
  /** "Suggested for you" — a soft hint from the intake answers, never a route. */
  suggested?: boolean;
  /** Click handler. Ignored when the Approach has nowhere to go. */
  onSelect?: () => void;
  /** Renders as a link instead of a button (the module home's grid). */
  href?: string;
  /**
   * Force the non-interactive rendering even for a lane that exists — the
   * guided start uses it for Approaches that cannot BEGIN a Rulebook, where
   * clicking away would throw the Expert's unsaved draft on the floor.
   */
  inert?: boolean;
}

/** A named Approach with nowhere to go yet is still a card — it just says so. */
function AvailabilityBadge({ approach }: { approach: DistillationApproach }) {
  if (approach.availability === "coming_soon") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Clock className="h-3 w-3" />
        Coming soon
      </span>
    );
  }
  if (approach.availability === "partial") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        Partly here
      </span>
    );
  }
  return null;
}

export function ApproachCard({
  approach,
  selected = false,
  suggested = false,
  onSelect,
  href,
  inert = false,
}: ApproachCardProps) {
  const look = APPROACH_LOOK[approach.key] ?? APPROACH_FALLBACK;
  const accent = ACCENT[look.accent];
  const Icon = look.icon;
  // THE DOOR LAW, inverted: no door, no click. A coming-soon Approach never
  // becomes a button that leads nowhere.
  const reachable = approach.availability !== "coming_soon" && !inert;

  const body = (
    <>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            selected ? accent.iconSelected : accent.icon,
            !reachable && "opacity-60",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <span className="block text-base font-semibold text-foreground">
            {approach.label}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {suggested && (
              <span
                className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                  accent.icon,
                )}
              >
                Suggested for you
              </span>
            )}
            <AvailabilityBadge approach={approach} />
          </span>
        </div>
        {selected && (
          <Check className={cn("ml-auto h-5 w-5 shrink-0", accent.check)} />
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {approach.blurb}
      </p>
      <div className="mt-auto space-y-1 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground/80">You bring:</span>{" "}
          {approach.whatItNeeds}
        </p>
        <p>
          <span className="font-medium text-foreground/80">Time:</span>{" "}
          {approach.costTimeShape}
        </p>
      </div>
    </>
  );

  const shell = cn(
    "group relative flex h-full w-full flex-col gap-3 rounded-2xl border-2 p-5 text-left transition-all",
    selected
      ? cn(accent.selected, "shadow-sm")
      : cn("border-border bg-card", reachable && cn("hover:shadow-lg", accent.hover)),
    !reachable && "border-dashed bg-muted/30",
    inert && approach.availability !== "coming_soon" && "bg-card",
  );

  if (!reachable) {
    return (
      <div className={shell} aria-disabled="true">
        {body}
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={shell}>
      {body}
    </button>
  );
}
