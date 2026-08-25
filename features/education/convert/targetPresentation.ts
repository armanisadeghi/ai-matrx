// features/education/convert/targetPresentation.ts
//
// ONE presentation table for the converter's target kinds: the icon, the accent
// colour, and the honest present-tense verb each kind shows while it is being
// produced. Every surface that lists study-kit targets (the ingest hero, the
// convert dialog, a future library filter) reads it here — the icon map used to
// be re-declared per surface, and the second copy is always the one that goes
// stale when a kind is added.
//
// Colour rule: education surfaces are used by kids and students, so a target
// board rendered in nothing but grey reads as broken/unfinished. The accents are
// deliberate, paired for light AND dark, and applied only as *accents* on top of
// the semantic surface tokens (`bg-card`, `border-border`) — never as a second
// background system.

import {
  Layers,
  Network,
  ScrollText,
  Headphones,
  ListChecks,
  FileCheck2,
  NotebookPen,
  Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TargetKind } from "./types";

export interface TargetPresentation {
  /**
   * The student-facing name for this format. Deliberately the word a learner
   * says out loud ("Flashcards", "Practice test"), not the storage token.
   */
  label: string;
  /**
   * What ONE countable unit of this format is called, so a surface can render
   * "12 cards" / "6 questions" without a second lookup. Null for formats that
   * are one document rather than a list of items.
   */
  unit: { one: string; many: string } | null;
  /**
   * The verb on the primary action of a FINISHED artifact. Distinct from
   * `runningVerb` (what the system is doing while producing it): a student
   * reads "Study" / "Listen" / "Take quiz", never a generic "Open".
   */
  verb: string;
  icon: LucideIcon;
  /** Icon / emphasis colour. */
  fg: string;
  /** Soft tinted chip behind the icon. */
  chip: string;
  /** Border tint for the row while it is active. */
  activeBorder: string;
  /**
   * Hover border tint, written out in full rather than composed from
   * `activeBorder` at runtime. Tailwind only generates classes it can find as
   * literal strings in the source, so `hover:${activeBorder}` would compile to
   * a class that does not exist in the stylesheet.
   */
  hoverBorder: string;
  /** Progress-bar fill while this target is running. */
  bar: string;
  /** What the system is DOING, in the student's words, while it runs. */
  runningVerb: string;
}

export const TARGET_PRESENTATION: Record<TargetKind, TargetPresentation> = {
  deck: {
    label: "Flashcards",
    unit: { one: "card", many: "cards" },
    verb: "Study",
    icon: Layers,
    fg: "text-sky-600 dark:text-sky-400",
    chip: "bg-sky-500/10",
    activeBorder: "border-sky-500/40",
    hoverBorder: "hover:border-sky-500/40",
    bar: "bg-sky-500",
    runningVerb: "Writing your flashcards",
  },
  summary: {
    label: "Summary",
    unit: null,
    verb: "Read",
    icon: ScrollText,
    fg: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10",
    activeBorder: "border-emerald-500/40",
    hoverBorder: "hover:border-emerald-500/40",
    bar: "bg-emerald-500",
    runningVerb: "Writing your summary",
  },
  mind_map: {
    label: "Mind map",
    unit: null,
    verb: "Explore",
    icon: Network,
    fg: "text-violet-600 dark:text-violet-400",
    chip: "bg-violet-500/10",
    activeBorder: "border-violet-500/40",
    hoverBorder: "hover:border-violet-500/40",
    bar: "bg-violet-500",
    runningVerb: "Mapping the ideas",
  },
  audio: {
    label: "Audio study",
    unit: null,
    verb: "Listen",
    icon: Headphones,
    fg: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10",
    activeBorder: "border-amber-500/40",
    hoverBorder: "hover:border-amber-500/40",
    bar: "bg-amber-500",
    runningVerb: "Recording your audio overview",
  },
  memory_aid: {
    label: "Memory aid",
    unit: null,
    verb: "Review",
    icon: Brain,
    fg: "text-fuchsia-600 dark:text-fuchsia-400",
    chip: "bg-fuchsia-500/10",
    activeBorder: "border-fuchsia-500/40",
    hoverBorder: "hover:border-fuchsia-500/40",
    bar: "bg-fuchsia-500",
    runningVerb: "Inventing memory tricks",
  },
  quiz: {
    label: "Quiz",
    unit: { one: "question", many: "questions" },
    verb: "Take quiz",
    icon: ListChecks,
    fg: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10",
    activeBorder: "border-rose-500/40",
    hoverBorder: "hover:border-rose-500/40",
    bar: "bg-rose-500",
    runningVerb: "Writing your quiz questions",
  },
  practice_test: {
    label: "Practice test",
    unit: { one: "question", many: "questions" },
    verb: "Take test",
    icon: FileCheck2,
    fg: "text-indigo-600 dark:text-indigo-400",
    chip: "bg-indigo-500/10",
    activeBorder: "border-indigo-500/40",
    hoverBorder: "hover:border-indigo-500/40",
    bar: "bg-indigo-500",
    runningVerb: "Building your practice test",
  },
  notes: {
    label: "Note",
    unit: null,
    verb: "Open",
    icon: NotebookPen,
    fg: "text-teal-600 dark:text-teal-400",
    chip: "bg-teal-500/10",
    activeBorder: "border-teal-500/40",
    hoverBorder: "hover:border-teal-500/40",
    bar: "bg-teal-500",
    runningVerb: "Taking your study notes",
  },
};
