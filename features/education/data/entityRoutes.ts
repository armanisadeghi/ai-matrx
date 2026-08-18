// features/education/data/entityRoutes.ts
//
// The ONE canonical map from an education entity token → its /education route,
// display label, group, and icon. Used by every surface that lists tagged /
// generated / class content (the class hub, reverse-lineage chips, …) so a
// route change lives in one place. Pure — no I/O.
//
// Tokens are `platform.entity_types` tokens; the route targets are the live
// /education app routes. An unknown token falls back to the platform entity
// registry's canonical `hrefFor` (Door Law: a named record must be reachable),
// and only a token with no registered route anywhere resolves linkless.

import {
  Layers,
  ListChecks,
  Headphones,
  NotebookPen,
  FileText,
  FileQuestion,
  type LucideIcon,
} from "lucide-react";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

export interface EducationEntityRoute {
  /** Display group header on aggregation surfaces. */
  group: string;
  /** Singular label for one item of this token. */
  label: string;
  Icon: LucideIcon;
  /** Build the /education href for an entity of this token, or null if it has no route. */
  href: (id: string) => string | null;
  /**
   * Build the href that DOES/STUDIES the resource (vs `href`, which VIEWS it) —
   * e.g. a deck deep-links to its study session, not its detail page. Omit when
   * "study" and "view" are the same URL; callers fall back to `href` (use the
   * `educationEntityStudyHref` convenience, never this field, to get that fallback).
   */
  studyHref?: (id: string) => string | null;
}

const ROUTES: Record<string, EducationEntityRoute> = {
  fc_set: {
    group: "Decks",
    label: "Flashcard deck",
    Icon: Layers,
    href: (id) => `/education/flashcards/${id}`,
    // Studying a deck deep-links straight into the classic-flip study session.
    studyHref: (id) => `/education/flashcards/${id}/study`,
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
    // Files open through the universal file viewer route (the same canonical
    // `/files/f/<id>` the platform entity registry declares).
    href: (id) => `/files/f/${id}`,
  },
};

/**
 * Unknown-token fallback: resolve the canonical route from the platform entity
 * registry so a token education doesn't curate still opens its record (Door
 * Law). Only a token with no registered `hrefFor` anywhere resolves linkless.
 */
function unknownRoute(token: string): EducationEntityRoute {
  const info = tryGetEntityInfo(token);
  return {
    group: "Other",
    label: info?.label ?? "Item",
    Icon: info?.Icon ?? FileQuestion,
    href: (id) => info?.hrefFor?.(id) ?? null,
  };
}

/** Resolve display + routing metadata for an education entity token. */
export function educationEntityRoute(token: string): EducationEntityRoute {
  return ROUTES[token] ?? unknownRoute(token);
}

/** Convenience: the /education href for a token+id, or null. */
export function educationEntityHref(token: string, id: string): string | null {
  return educationEntityRoute(token).href(id);
}

/**
 * Convenience: the href that STUDIES/DOES a token+id (deck → study session,
 * quiz → the quiz page), falling back to the plain view `href` when a token has
 * no distinct study route. Null when the token has no route at all.
 */
export function educationEntityStudyHref(
  token: string,
  id: string,
): string | null {
  const route = educationEntityRoute(token);
  return (route.studyHref ?? route.href)(id);
}
