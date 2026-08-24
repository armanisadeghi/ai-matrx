"use client";

/**
 * The kind loading-component registry — slug → hardcoded loader.
 *
 * Selection: `kind_definition.metadata.loading_component` names one of these
 * slugs; missing/unknown slugs resolve to the `generic` skeleton. The studio
 * / creator agent sets the slug at authoring time; this module only READS it.
 *
 * The library is intentionally hardcoded (zero fetch delay — it must render
 * the instant a cloud kind is identified, before any DB answer) and light.
 * Growing it = add the component in kind-loading-components.tsx + one row
 * here + document the slug in SHAPE_SYSTEM.md.
 */

import type React from "react";
import type { KindLoadingProps } from "./kind-loading.types";
import type { KindLoadingSlug } from "./kind-loading-slugs";
import {
  CardLoading,
  ChartLoading,
  ChatLoading,
  CodeLoading,
  DeckLoading,
  DiagramLoading,
  DocumentLoading,
  FlashcardsLoading,
  FormLoading,
  GalleryLoading,
  GenericLoading,
  KanbanLoading,
  ListLoading,
  MapLoading,
  MediaLoading,
  MinimalLoading,
  NotesLoading,
  ProgressLoading,
  QuizLoading,
  StatGridLoading,
  TableLoading,
  TimelineLoading,
  TreeLoading,
} from "./kind-loading-components";

export { DEFAULT_KIND_LOADING_SLUG, KIND_LOADING_SLUGS } from "./kind-loading-slugs";

// Typed against the pure slug list (kind-loading-slugs.ts) — a slug added
// there without a component here (or vice versa) is a COMPILE error. The pure
// list is what the shape doctor / CLI validate declarations against.
const KIND_LOADING_COMPONENTS_EXACT = {
  card: CardLoading,
  list: ListLoading,
  table: TableLoading,
  timeline: TimelineLoading,
  chart: ChartLoading,
  deck: DeckLoading,
  flashcards: FlashcardsLoading,
  quiz: QuizLoading,
  notes: NotesLoading,
  form: FormLoading,
  media: MediaLoading,
  "stat-grid": StatGridLoading,
  document: DocumentLoading,
  diagram: DiagramLoading,
  chat: ChatLoading,
  gallery: GalleryLoading,
  kanban: KanbanLoading,
  tree: TreeLoading,
  code: CodeLoading,
  map: MapLoading,
  progress: ProgressLoading,
  minimal: MinimalLoading,
  generic: GenericLoading,
} satisfies Record<KindLoadingSlug, React.ComponentType<KindLoadingProps>>;

export const KIND_LOADING_COMPONENTS: Readonly<
  Record<string, React.ComponentType<KindLoadingProps>>
> = KIND_LOADING_COMPONENTS_EXACT;

/**
 * Resolve a loading component: the kind's declared slug, else the generic
 * default. Never null — the loading layer must always have something to show.
 */
export function resolveKindLoadingComponent(
  slug: string | null | undefined,
): React.ComponentType<KindLoadingProps> {
  return (
    (slug
      ? KIND_LOADING_COMPONENTS[slug]
      : undefined) ?? GenericLoading
  );
}
