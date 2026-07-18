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
import {
  CardLoading,
  ChartLoading,
  ChatLoading,
  CodeLoading,
  DeckLoading,
  DiagramLoading,
  DocumentLoading,
  FormLoading,
  GalleryLoading,
  GenericLoading,
  KanbanLoading,
  ListLoading,
  MapLoading,
  MediaLoading,
  MinimalLoading,
  ProgressLoading,
  StatGridLoading,
  TableLoading,
  TimelineLoading,
  TreeLoading,
} from "./kind-loading-components";

export const DEFAULT_KIND_LOADING_SLUG = "generic" as const;

export const KIND_LOADING_COMPONENTS: Record<
  string,
  React.ComponentType<KindLoadingProps>
> = {
  card: CardLoading,
  list: ListLoading,
  table: TableLoading,
  timeline: TimelineLoading,
  chart: ChartLoading,
  deck: DeckLoading,
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
};

/**
 * Resolve a loading component: the kind's declared slug, else the generic
 * default. Never null — the loading layer must always have something to show.
 */
export function resolveKindLoadingComponent(
  slug: string | null | undefined,
): React.ComponentType<KindLoadingProps> {
  return (slug ? KIND_LOADING_COMPONENTS[slug] : undefined) ?? GenericLoading;
}
