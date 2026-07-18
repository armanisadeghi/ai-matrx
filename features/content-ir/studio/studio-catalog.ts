/**
 * Shapes studio catalog — the user-facing list read over
 * `content_ir.kind_definition` (+ `kind_component` for the has-component
 * flag). Browser-client reads, RLS-scoped: a user's list naturally shows
 * platform/public kinds plus their org's own kinds — no admin RPC, no
 * privilege-complete gather (that stays in admin/shape-doctor-server.ts).
 *
 * Pure assembly (`buildShapeStudioList`, `partitionShapes`) is jest-testable;
 * `listShapesForUser` is the async browser assembler.
 */

import type { Json } from "@/types/database.types";
import { GENERATED_CONTRACT_FAMILY_VALUES } from "../registry/schema-source-kind-tables";

export interface ShapeListEntry {
  id: string;
  kind: string;
  label: string;
  isActive: boolean;
  visibility: string;
  /** `metadata.family` — machine-contract families vs display groups. */
  family: string | null;
  version: number;
  updatedAt: string;
  /** At least one active `kind_component` row (a custom renderer exists). */
  hasComponent: boolean;
}

export interface ShapeStudioSections {
  /** Kinds owned by the viewer's org(s) — the user's own shapes. */
  mine: ShapeListEntry[];
  /** Platform/public kinds — visually secondary in the list. */
  platform: ShapeListEntry[];
}

export interface ShapeDefinitionRowLite {
  id: string;
  kind: string;
  label: string;
  is_active: boolean;
  visibility: string;
  metadata: Json;
  version: number;
  updated_at: string;
}

function familyOf(metadata: Json): string | null {
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    typeof (metadata as { family?: unknown }).family === "string"
  ) {
    return (metadata as { family: string }).family;
  }
  return null;
}

/**
 * Pure merge: definition rows + active-component definition ids → entries.
 * Machine-contract kinds (`metadata.family` in agent_io / tool_io / action_io /
 * workflow_io) are EXCLUDED — they are generated I/O contracts, not shapes a
 * user browses, previews, or tests.
 */
export function buildShapeStudioList(
  defs: ShapeDefinitionRowLite[],
  activeComponentDefinitionIds: ReadonlySet<string>,
): ShapeListEntry[] {
  return defs
    .filter((d) => {
      const family = familyOf(d.metadata);
      return family === null || !GENERATED_CONTRACT_FAMILY_VALUES.has(family);
    })
    .map(
      (d): ShapeListEntry => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        isActive: d.is_active,
        visibility: d.visibility,
        family: familyOf(d.metadata),
        version: d.version,
        updatedAt: d.updated_at,
        hasComponent: activeComponentDefinitionIds.has(d.id),
      }),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Split the RLS-visible catalog for display: `public` rows are the platform
 * library (secondary); everything else the viewer can see is theirs (their
 * org's rows — RLS already did the authorization).
 */
export function partitionShapes(entries: ShapeListEntry[]): ShapeStudioSections {
  const mine: ShapeListEntry[] = [];
  const platform: ShapeListEntry[] = [];
  for (const entry of entries) {
    (entry.visibility === "public" ? platform : mine).push(entry);
  }
  return { mine, platform };
}

/** Browser assembler — two RLS-scoped reads, loud on failure. */
export async function listShapesForUser(): Promise<ShapeListEntry[]> {
  const { supabase } = await import("@/utils/supabase/client");

  const [defsRes, compsRes] = await Promise.all([
    supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id,kind,label,is_active,visibility,metadata,version,updated_at")
      .is("deleted_at", null),
    supabase
      .schema("content_ir")
      .from("kind_component")
      .select("kind_definition_id")
      .eq("is_active", true)
      .is("deleted_at", null),
  ]);

  if (defsRes.error) {
    throw new Error(`Failed to load shapes: ${defsRes.error.message}`);
  }
  if (compsRes.error) {
    throw new Error(
      `Failed to load shape components: ${compsRes.error.message}`,
    );
  }

  const componentIds = new Set(
    (compsRes.data ?? [])
      .map((r) => r.kind_definition_id)
      .filter((id): id is string => typeof id === "string"),
  );

  return buildShapeStudioList(defsRes.data ?? [], componentIds);
}
