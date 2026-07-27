"use client";

/**
 * Thin client shell that publishes the `matrx-user/shapes` surface scope for a
 * SERVER-rendered Shape Studio route.
 *
 * The Preview, Instances, and Test tabs are already client components and mount
 * their own richer providers. The Schema route is not: `KindSchemaTab` is a
 * shared read-only view (the admin console renders it too), so wrapping THAT
 * component would leak a user-surface emitter into admin. This shell wraps the
 * route instead, taking exactly what the server loader already fetched.
 *
 * Emits identity + schema only. It deliberately does NOT emit samples,
 * instances, or the activation verdict — the schema route loads none of them,
 * and a surface must never declare a value it does not actually produce here.
 */

import { useCallback, type ReactNode } from "react";
import type { Json } from "@/types/database.types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";

interface ShapeSurfaceRuntimeProps {
  /** Which studio route this is — mirrors the manifest's `studio_tab`. */
  studioTab: "schema" | "instances" | "test";
  kind: string;
  label: string;
  kindDefinitionId: string;
  kindVersion: number;
  visibility: string;
  isActive: boolean;
  titleKey: string | null;
  loadingComponent: string | null;
  isOwnedByViewer: boolean;
  updatedAt: string;
  fieldData: Json | null;
  emittedJsonSchema: Json | null;
  children: ReactNode;
}

export default function ShapeSurfaceRuntime({
  studioTab,
  kind,
  label,
  kindDefinitionId,
  kindVersion,
  visibility,
  isActive,
  titleKey,
  loadingComponent,
  isOwnedByViewer,
  updatedAt,
  fieldData,
  emittedJsonSchema,
  children,
}: ShapeSurfaceRuntimeProps) {
  const getScope = useCallback(
    () =>
      createShapesScope({
        studio_tab: studioTab,
        kind_slug: kind,
        kind_label: label,
        kind_definition_id: kindDefinitionId,
        kind_version: kindVersion,
        kind_visibility: visibility,
        kind_is_active: isActive,
        kind_title_key: titleKey ?? undefined,
        kind_loading_component: loadingComponent ?? undefined,
        kind_owned_by_viewer: isOwnedByViewer,
        kind_updated_at: updatedAt,
        kind_field_data: Array.isArray(fieldData) ? fieldData : undefined,
        kind_emitted_json_schema:
          (emittedJsonSchema as Record<string, unknown> | null) ?? undefined,
      }),
    [
      studioTab,
      kind,
      label,
      kindDefinitionId,
      kindVersion,
      visibility,
      isActive,
      titleKey,
      loadingComponent,
      isOwnedByViewer,
      updatedAt,
      fieldData,
      emittedJsonSchema,
    ],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/shapes"
      getScope={getScope}
      isEditable={false}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
