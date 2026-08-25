// features/education/library/artifactVisuals.ts
//
// ONE visual vocabulary for a study artifact — icon, colour, verb, and the
// human name for what it is made of. Shared by the library's card view, row
// view, and table, and by the Education home's blocks, so a flashcard deck
// looks and reads the same everywhere the learner meets it.
//
// Why colour at all: the library is a mixed list of eight artifact formats. In
// one neutral colour a learner scans it linearly and reads every title; with a
// per-format colour they find "my audio one" in a glance. This is the cheapest
// legibility win on the surface, and it is why the list may never go back to a
// single grey icon column.
//
// Tokens only — each entry names Tailwind classes that already resolve in both
// themes. Never a raw hex, never an inline style.

import {
  BookOpen,
  Brain,
  FileCheck2,
  FileText,
  Headphones,
  Layers,
  ListChecks,
  Network,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

export interface ArtifactVisual {
  /** Human name for the format ("Flashcards", "Practice test"). */
  label: string;
  icon: LucideIcon;
  /** Icon tile classes (background + foreground), light and dark. */
  tile: string;
  /** Accent text colour for counts and small emphasis. */
  accent: string;
  /** Border tint used on hover so a card lights up in its own colour. */
  hoverBorder: string;
  /** What ONE unit of this artifact is called: "12 cards", "6 questions". */
  unit: { one: string; many: string } | null;
  /** The verb on the primary action — a student reads "Study", never "Open". */
  verb: string;
}

const FALLBACK: ArtifactVisual = {
  label: "Study item",
  icon: BookOpen,
  tile: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  accent: "text-slate-600 dark:text-slate-300",
  hoverBorder: "hover:border-slate-500/40",
  unit: null,
  verb: "Open",
};

/**
 * Keyed by the library's `subtype`, which is the format the learner actually
 * distinguishes ("quiz" vs "practice test"), not the storage `kind`.
 */
const BY_SUBTYPE: Record<string, ArtifactVisual> = {
  flashcards: {
    label: "Flashcards",
    icon: Layers,
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    accent: "text-sky-600 dark:text-sky-400",
    hoverBorder: "hover:border-sky-500/40",
    unit: { one: "card", many: "cards" },
    verb: "Study",
  },
  quiz: {
    label: "Quiz",
    icon: ListChecks,
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    accent: "text-amber-600 dark:text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
    unit: { one: "question", many: "questions" },
    verb: "Take quiz",
  },
  practice_test: {
    label: "Practice test",
    icon: FileCheck2,
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    accent: "text-violet-600 dark:text-violet-400",
    hoverBorder: "hover:border-violet-500/40",
    unit: { one: "question", many: "questions" },
    verb: "Take test",
  },
  audio: {
    label: "Audio study",
    icon: Headphones,
    tile: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    accent: "text-pink-600 dark:text-pink-400",
    hoverBorder: "hover:border-pink-500/40",
    unit: null,
    verb: "Listen",
  },
  summary: {
    label: "Summary",
    icon: FileText,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    accent: "text-emerald-600 dark:text-emerald-400",
    hoverBorder: "hover:border-emerald-500/40",
    unit: null,
    verb: "Read",
  },
  mind_map: {
    label: "Mind map",
    icon: Network,
    tile: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    accent: "text-indigo-600 dark:text-indigo-400",
    hoverBorder: "hover:border-indigo-500/40",
    unit: null,
    verb: "Explore",
  },
  memory_aid: {
    label: "Memory aid",
    icon: Brain,
    tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    accent: "text-rose-600 dark:text-rose-400",
    hoverBorder: "hover:border-rose-500/40",
    unit: null,
    verb: "Review",
  },
  notes: {
    label: "Note",
    icon: NotebookPen,
    tile: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    accent: "text-teal-600 dark:text-teal-400",
    hoverBorder: "hover:border-teal-500/40",
    unit: null,
    verb: "Open",
  },
};

export function artifactVisual(subtype: string | null): ArtifactVisual {
  if (!subtype) return FALLBACK;
  return BY_SUBTYPE[subtype] ?? FALLBACK;
}

/** "12 cards" / "1 question" / null when the format has no countable unit. */
export function artifactCount(
  subtype: string | null,
  count: number | null,
): string | null {
  const v = artifactVisual(subtype);
  if (!v.unit || count == null) return null;
  return `${count} ${count === 1 ? v.unit.one : v.unit.many}`;
}

/** "12 min" from a duration in seconds. Null below a minute or when absent. */
export function artifactDuration(seconds: number | null): string | null {
  if (!seconds || seconds < 60) return null;
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}
