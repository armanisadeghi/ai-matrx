// features/education/data/entityRoutes.ts
//
// The ONE canonical map from an education entity token → its /education route,
// display label, group, and icon. Used by every surface that lists tagged /
// generated / class content (the class hub, reverse-lineage chips, …) so a
// route change lives in one place. Pure — no I/O.
//
// Tokens are `platform.entity_types` tokens; the route targets are the live
// /education app routes. An unknown token resolves to a linkless "Other" entry
// (never a broken link).

import {
  Layers,
  ListChecks,
  Headphones,
  NotebookPen,
  FileText,
  FileQuestion,
  type LucideIcon,
} from "lucide-react";

export interface EducationEntityRoute {
  /** Display group header on aggregation surfaces. */
  group: string;
  /** Singular label for one item of this token. */
  label: string;
  Icon: LucideIcon;
  /** Build the /education href for an entity of this token, or null if it has no route. */
  href: (id: string) => string | null;
}

const ROUTES: Record<string, EducationEntityRoute> = {
  fc_set: {
    group: "Decks",
    label: "Flashcard deck",
    Icon: Layers,
    href: (id) => `/education/flashcards/${id}`,
  },
  assessment: {
    group: "Quizzes & Tests",
    label: "Quiz / test",
    Icon: ListChecks,
    href: (id) => `/education/quizzes/${id}`,
  },
  study_media: {
    group: "Audio & Media",
    label: "Study media",
    Icon: Headphones,
    href: (id) => `/education/media/${id}`,
  },
  note: {
    group: "Notes",
    label: "Note",
    Icon: NotebookPen,
    href: (id) => `/education/notes/${id}`,
  },
  file: {
    group: "Source materials",
    label: "File",
    Icon: FileText,
    // Files render through the universal file handler, not an /education route.
    href: () => null,
  },
};

const UNKNOWN: EducationEntityRoute = {
  group: "Other",
  label: "Item",
  Icon: FileQuestion,
  href: () => null,
};

/** Resolve display + routing metadata for an education entity token. */
export function educationEntityRoute(token: string): EducationEntityRoute {
  return ROUTES[token] ?? UNKNOWN;
}

/** Convenience: the /education href for a token+id, or null. */
export function educationEntityHref(token: string, id: string): string | null {
  return educationEntityRoute(token).href(id);
}
