"use client";

/**
 * Browser-side preflight for Convert JSON to Shape. Reads the viewer-visible
 * registration directly from content_ir and reuses the canonical cold
 * component resolver source; no API route and no second component-selection
 * algorithm.
 */

import { createClient } from "@/utils/supabase/client";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { getKindComponentBySlug } from "@/features/content-ir/registry/schema-source-kind-components";
import {
  buildShapeReadiness,
  type ShapeDefinitionSnapshot,
  type ShapeReadiness,
} from "@/features/content-ir/studio/convert-to-shape";

export class ShapeReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapeReadinessError";
  }
}

/** Load the exact Shape registration and renderer facts for one root __kind. */
export async function loadShapeReadiness(
  rootKind: string,
): Promise<ShapeReadiness> {
  const supabase = createClient();
  const [{ data: definitions, error }, components] = await Promise.all([
    supabase
      .schema("content_ir")
      .from("kind_definition")
      .select(
        "id,kind,label,is_active,version,visibility,emitted_json_schema,metadata,authoring_owner,is_contract_artifact,created_at",
      )
      .eq("kind", rootKind)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(2),
    getKindComponentBySlug(rootKind, "web"),
  ]);
  if (error) {
    throw new ShapeReadinessError(
      `Failed to inspect Shape "${rootKind}": ${error.message}`,
    );
  }
  if (definitions && definitions.length > 1) {
    console.error(
      `[content-ir] Convert to Shape found duplicate live registrations for "${rootKind}"; using the oldest visible row.`,
    );
  }

  const row = definitions?.[0];
  const definition: ShapeDefinitionSnapshot | null = row
    ? {
        id: row.id,
        kind: row.kind,
        label: row.label,
        isActive: row.is_active,
        version: row.version,
        visibility: row.visibility,
        emittedJsonSchema: row.emitted_json_schema,
        metadata: row.metadata,
        authoringOwner: row.authoring_owner,
        isContractArtifact: row.is_contract_artifact,
      }
    : null;
  const compiled = kindRegistry.getDefinition(rootKind);

  return buildShapeReadiness({
    rootKind,
    definition,
    components,
    compiledComponentKey: compiled?.legacyBlockType ?? null,
    compiledLoadingSlug: compiled?.loadingComponent ?? null,
  });
}
