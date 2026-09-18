"use client";

/**
 * features/marketing/seo/topical-map/ui/IntentDot.tsx — the convergence dot.
 *
 * ONE dot answers "where is this page going", and its colour comes from the
 * org's `intent_colors` knob, never from this file's taste.
 *
 * `on_no_topic` and `intent_topic_hidden` are ROUND 22's honest states and have
 * no `intent_colors` entry ON PURPOSE (see `redux/types.ts` → PageTopicState):
 * they are not a disposition, they are the absence of a live topic, so both
 * take `colors.missing`. Drawing them as anything else would claim the page has
 * a destination it does not have.
 */

import { cn } from "@/lib/utils";
import type { MapIntentColors } from "../knobs";
import type { PageIntentTone, PageTopicState } from "../redux/types";
import { intentColorClasses } from "./intentColorClasses";

export interface IntentDotProps {
  tone: PageIntentTone | PageTopicState;
  colors: MapIntentColors;
  /** Shown beside the dot. Without it the dot still carries the word in `title`. */
  label?: string;
}

const TONE_TITLES: Record<PageIntentTone | PageTopicState, string> = {
  in_place: "Already on the right topic",
  leaving: "Leaving the topic it covers today",
  arriving: "Arriving at this topic",
  delete: "Marked for deletion",
  planned: "Planned, not published yet",
  on_no_topic: "On no topic — nothing live covers it",
  intent_topic_hidden: "Its destination topic was retired or rejected",
};

function colourNameFor(tone: IntentDotProps["tone"], colors: MapIntentColors): string {
  switch (tone) {
    case "in_place":
      return colors.in_place;
    case "leaving":
      return colors.leaving;
    case "arriving":
      return colors.arriving;
    case "delete":
      return colors.delete;
    case "planned":
      return colors.planned;
    // No live topic → the `missing` treatment, by the law above.
    case "on_no_topic":
    case "intent_topic_hidden":
      return colors.missing;
  }
}

export function IntentDot({ tone, colors, label }: IntentDotProps) {
  const classes = intentColorClasses(colourNameFor(tone, colors));
  const title = TONE_TITLES[tone];
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={title}>
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 rounded-full border", classes.dot)}
      />
      {label ? (
        <span className={cn("text-[11px] leading-none", classes.text)}>{label}</span>
      ) : (
        <span className="sr-only">{title}</span>
      )}
    </span>
  );
}
