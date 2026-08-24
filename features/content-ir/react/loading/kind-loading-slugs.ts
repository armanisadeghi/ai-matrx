/**
 * The kind loading-component LIBRARY SLUGS — the pure half of the loading
 * registry, importable anywhere (shape doctor, CLI, server) without pulling
 * React or the components themselves.
 *
 * ONE SOURCE OF TRUTH: `kind-loading-registry.ts` types its component map as
 * `Record<KindLoadingSlug, …>`, so a slug added here without a component (or
 * vice versa) is a compile error, never silent drift.
 *
 * A `kind_definition.metadata.loading_component` (or a compiled definition's
 * `loadingComponent`) naming a slug NOT in this list silently falls back to
 * the `generic` skeleton at runtime — that is the defect the shape doctor's
 * `loading` column screams about (`unknown-loading-component`).
 */

export const KIND_LOADING_SLUGS = [
  "card",
  "list",
  "table",
  "timeline",
  "chart",
  "deck",
  "flashcards",
  "quiz",
  "notes",
  "form",
  "media",
  "stat-grid",
  "document",
  "diagram",
  "chat",
  "gallery",
  "kanban",
  "tree",
  "code",
  "map",
  "progress",
  "minimal",
  "generic",
] as const;

export type KindLoadingSlug = (typeof KIND_LOADING_SLUGS)[number];

export const DEFAULT_KIND_LOADING_SLUG = "generic" as const satisfies KindLoadingSlug;

export function isKnownKindLoadingSlug(slug: string): slug is KindLoadingSlug {
  return (KIND_LOADING_SLUGS as readonly string[]).includes(slug);
}
