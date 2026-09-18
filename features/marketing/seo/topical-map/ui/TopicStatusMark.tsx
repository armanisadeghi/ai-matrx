"use client";

/**
 * features/marketing/seo/topical-map/ui/TopicStatusMark.tsx
 *
 * ACTIVE RENDERS NOTHING. Most topics in a healthy map are active; a badge on
 * every row would be pure noise and would make the three states that DO matter
 * — proposed, retired, rejected — invisible in the crowd. A mark appears only
 * when the topic is not simply live.
 *
 * An unknown status is NOT hidden: a status this build has never seen still
 * gets a neutral mark carrying the raw word, because a screen that silently
 * drops a state is the blank cell the whole map feature exists to kill.
 */

import { CircleDashed, CircleDotDashed, CircleSlash } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MapTopicStatus } from "../types";

export interface TopicStatusMarkProps {
  status: MapTopicStatus | string;
  /** Icon only, with the word in the tooltip. For dense rows. */
  compact?: boolean;
}

const KNOWN = {
  proposed: {
    label: "Proposed",
    // NOT a Sparkle: a proposed topic is the AI's suggestion, and the Sparkles
    // family is banned as this app's AI signifier (CLAUDE.md § Icons). The three
    // marks share one circle grammar — dotted-dashed = provisional, dashed =
    // retired, slashed = rejected — so they read as one set at 12px.
    icon: CircleDotDashed,
    classes: "text-info border-info/40 bg-info/10",
    title: "Proposed — not part of the map until it is accepted.",
  },
  retired: {
    label: "Retired",
    icon: CircleDashed,
    classes: "text-muted-foreground border-border bg-muted/50",
    title: "Retired — kept for history, no longer part of the live map.",
  },
  rejected: {
    label: "Rejected",
    icon: CircleSlash,
    classes: "text-destructive border-destructive/40 bg-destructive/10",
    title: "Rejected — turned down, no longer part of the live map.",
  },
} as const;

export function TopicStatusMark({ status, compact }: TopicStatusMarkProps) {
  if (status === "active") return null;

  const known = KNOWN[status as keyof typeof KNOWN];
  const label = known?.label ?? status;
  const title = known?.title ?? `Status "${status}" — this app does not know this state.`;
  const Icon = known?.icon ?? CircleDashed;
  const classes = known?.classes ?? "text-muted-foreground border-border bg-muted/50";

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1 py-px text-[10px] font-medium leading-none",
        classes,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
