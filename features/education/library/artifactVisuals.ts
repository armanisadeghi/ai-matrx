// features/education/library/artifactVisuals.ts
//
// The library's ADAPTER onto the canonical education presentation table.
//
// `convert/targetPresentation.ts` already owns the icon, colour, name, unit and
// verb for every study format, and its header explicitly reserves this seat:
// "every surface that lists study-kit targets (the ingest hero, the convert
// dialog, a future library filter) reads it here — the icon map used to be
// re-declared per surface, and the second copy is always the one that goes
// stale." This file is that library filter, and it does NOT redeclare any of
// it. All it does is bridge the two vocabularies:
//
//   library `subtype`  (how the artifact is STORED:  flashcards, quiz, …)
//        ↕
//   converter `TargetKind` (how it was PRODUCED:     deck,       quiz, …)
//
// Add a format → add it to `TARGET_PRESENTATION` and to `SUBTYPE_TO_TARGET`
// below. Never add a colour here.

import { BookOpen } from "lucide-react";
import {
  TARGET_PRESENTATION,
  type TargetPresentation,
} from "../convert/targetPresentation";
import type { TargetKind } from "../convert/types";

/**
 * The two vocabularies are 1:1 today; only `flashcards`/`deck` differ in
 * spelling. Anything unmapped falls back rather than throwing — an unknown
 * subtype is a new format we have not wired yet, not a reason to blank the row.
 */
const SUBTYPE_TO_TARGET: Record<string, TargetKind> = {
  flashcards: "deck",
  quiz: "quiz",
  practice_test: "practice_test",
  audio: "audio",
  summary: "summary",
  mind_map: "mind_map",
  memory_aid: "memory_aid",
  notes: "notes",
};

/** Neutral presentation for a format that is not in the converter's table. */
const FALLBACK: TargetPresentation = {
  label: "Study item",
  unit: null,
  verb: "Open",
  icon: BookOpen,
  fg: "text-slate-600 dark:text-slate-300",
  chip: "bg-slate-500/10",
  activeBorder: "border-slate-500/40",
  hoverBorder: "hover:border-slate-500/40",
  bar: "bg-slate-500",
  runningVerb: "Working on it",
};

/** The converter target a library subtype corresponds to (null if unmapped). */
export function targetKindForSubtype(subtype: string | null): TargetKind | null {
  if (!subtype) return null;
  return SUBTYPE_TO_TARGET[subtype] ?? null;
}

/** Canonical presentation for a library row's `subtype`. */
export function artifactVisual(subtype: string | null): TargetPresentation {
  const target = targetKindForSubtype(subtype);
  return target ? TARGET_PRESENTATION[target] : FALLBACK;
}

/** Canonical presentation for a converter `TargetKind`. */
export function targetVisual(kind: TargetKind | string | null): TargetPresentation {
  if (!kind) return FALLBACK;
  return TARGET_PRESENTATION[kind as TargetKind] ?? FALLBACK;
}

/**
 * The icon tile classes for a format — `chip` (background) and `fg`
 * (foreground) composed, since every surface that renders a tile wants both.
 */
export function artifactTile(presentation: TargetPresentation): string {
  return `${presentation.chip} ${presentation.fg}`;
}

/** "12 cards" / "1 question" / null when the format has no countable unit. */
export function artifactCount(
  subtype: string | null,
  count: number | null,
): string | null {
  const { unit } = artifactVisual(subtype);
  if (!unit || count == null) return null;
  return `${count} ${count === 1 ? unit.one : unit.many}`;
}

/** "12 min" from a duration in seconds. Null below a minute or when absent. */
export function artifactDuration(seconds: number | null): string | null {
  if (!seconds || seconds < 60) return null;
  return `${Math.round(seconds / 60)} min`;
}
