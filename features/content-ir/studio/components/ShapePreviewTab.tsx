"use client";

// Preview tab body — the shape's canonical examples rendered through the REAL
// production kind route (shared engine, same one the admin page uses).

import { useCallback, useState } from "react";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import KindExamplePreview from "@/features/content-ir/studio/components/KindExamplePreview";
import ShapeOwnerEditor from "@/features/content-ir/studio/components/ShapeOwnerEditor";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import { shapeTestHref } from "@/features/content-ir/studio/constants";
import type { Json } from "@/types/database.types";
import type { ShapeActivationVerdict } from "@/features/content-ir/studio/shape-authoring-service";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";

interface ShapePreviewTabProps {
  kind: string;
  kindDefinitionId: string;
  label: string;
  visibility: string;
  titleKey: string | null;
  loadingComponent: string | null;
  emittedJsonSchema: Json | null;
  isActive: boolean;
  isOwnedByViewer: boolean;
  /** Definition version — surface value only (display lives in the header). */
  kindVersion: number;
  /** ISO timestamp of the definition's last update — surface value only. */
  updatedAt: string;
  /** Authored `StoredFieldElement[]` (null for Python-owned kinds). */
  fieldData: Json | null;
}

export default function ShapePreviewTab({
  kind,
  kindDefinitionId,
  label,
  visibility,
  titleKey,
  loadingComponent,
  emittedJsonSchema,
  isActive,
  isOwnedByViewer,
  kindVersion,
  updatedAt,
  fieldData,
}: ShapePreviewTabProps) {
  const [examplesRevision, setExamplesRevision] = useState(0);
  const examples = useKindExamples(kindDefinitionId, examplesRevision);
  // The dual-gate verdict is fetched ONCE, inside ShapeActivationControl
  // (owner-only). It publishes here so the Shape Studio surface can emit it
  // without a second RPC; stays null for non-owners, which is honest — the
  // activation_* values simply are not available to them.
  const [activationVerdict, setActivationVerdict] =
    useState<ShapeActivationVerdict | null>(null);

  // Surface scope (matrx-user/shapes) — built at TRIGGER time from live state.
  const getSurfaceScope = useCallback(
    () =>
      createShapesScope({
        studio_tab: "preview",
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
        kind_examples:
          examples.status === "ready"
            ? (examples.rows as unknown as Array<Record<string, unknown>>)
            : undefined,
        kind_example_count:
          examples.status === "ready" ? examples.rows.length : undefined,
        canonical_example_present:
          examples.status === "ready"
            ? examples.rows.some((row) => row.isCanonical)
            : undefined,
        activation_would_activate: activationVerdict?.wouldActivate,
        activation_structural_ok: activationVerdict?.structuralOk,
        activation_render_ok: activationVerdict?.renderOk,
        activation_render_leg_applicable:
          activationVerdict?.renderLegApplicable,
        activation_component_platforms: activationVerdict?.componentPlatforms,
        activation_reasons: activationVerdict?.reasons,
        kind_activation: activationVerdict
          ? (activationVerdict as unknown as Record<string, unknown>)
          : undefined,
      }),
    [
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
      examples,
      activationVerdict,
    ],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/shapes"
      getScope={getSurfaceScope}
      isEditable={false}
    >
      {isOwnedByViewer && (
        <ShapeOwnerEditor
          kind={kind}
          kindDefinitionId={kindDefinitionId}
          label={label}
          visibility={visibility}
          titleKey={titleKey}
          loadingComponent={loadingComponent}
          emittedJsonSchema={emittedJsonSchema}
          isActive={isActive}
          examples={examples}
          onExamplesChanged={() =>
            setExamplesRevision((revision) => revision + 1)
          }
          onActivationVerdict={setActivationVerdict}
        />
      )}
      <KindExamplePreview
        kind={kind}
        examples={examples}
        emptyState={
          <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              No saved examples for this shape yet.
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {isOwnedByViewer
                ? "Add the first canonical sample above, or try the Shape live."
                : "Try it live instead — fill the form and watch its component render the result."}
            </p>
            <Link
              href={shapeTestHref(kind)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Open the Test tab
            </Link>
          </div>
        }
      />
    </SurfaceRuntimeProvider>
  );
}
