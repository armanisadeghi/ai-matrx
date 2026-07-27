"use client";

/**
 * Build the `matrx-user/cms-component` surface scope at trigger time.
 *
 * Mirrors `useCmsPageSurfaceScope.ts`. Returns a `() => SurfaceScopePayload`
 * builder rather than a static object so every consumer reads live editor
 * state + the site-level cache (`useSiteContext()`) at click time.
 */

import { useCallback } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { buildCmsComponentContextData } from "../agent-context/buildCmsComponentContextData";
import type { ClientComponent, ClientPageSummary, ClientSite } from "../types";

export interface UseCmsComponentSurfaceScopeParams {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  editingComponent: ClientComponent | null;
  htmlContent?: string;
  cssContent?: string;
  /** Unsaved "New Component" dialog values — undefined when the dialog is closed. */
  pendingComponent?: { name: string; componentType: string };
}

export function useCmsComponentSurfaceScope(
  params: UseCmsComponentSurfaceScopeParams,
): () => SurfaceScopePayload {
  const {
    site,
    pages,
    components,
    editingComponent,
    htmlContent,
    cssContent,
    pendingComponent,
  } = params;
  const pendingName = pendingComponent?.name;
  const pendingType = pendingComponent?.componentType;

  return useCallback(
    () =>
      buildCmsComponentContextData({
        site,
        pages,
        components,
        editingComponent,
        htmlContent,
        cssContent,
        pendingComponent:
          pendingName !== undefined && pendingType !== undefined
            ? { name: pendingName, componentType: pendingType }
            : undefined,
      }) as SurfaceScopePayload,
    [
      site,
      pages,
      components,
      editingComponent,
      htmlContent,
      cssContent,
      pendingName,
      pendingType,
    ],
  );
}
