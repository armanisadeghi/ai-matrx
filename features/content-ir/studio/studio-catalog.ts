/**
 * Shapes studio catalog — the user-facing list read over
 * `content_ir.kind_definition` (+ `kind_component` for the has-component
 * flag). Browser-client reads, RLS-visible per the live std_select policy
 * (public/system kinds + rows the viewer created or was granted) — no admin
 * RPC, no privilege-complete gather (that stays in admin/shape-doctor-server.ts).
 *
 * Display split is CREATOR-scoped: "Your shapes" = rows the current auth user
 * created; everything else visible (platform kinds + granted rows) is the
 * secondary platform/library section. Visibility is NOT ownership — a user's
 * own public kind is still theirs, and a teammate's granted internal kind is
 * not.
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
  /** `created_by` — drives the creator-scoped "Your shapes" split. */
  createdBy: string | null;
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
  /** Kinds the current auth user CREATED — "Your shapes". */
  mine: ShapeListEntry[];
  /** Everything else visible (platform kinds + granted rows) — secondary. */
  platform: ShapeListEntry[];
}

export interface ShapeDefinitionRowLite {
  id: string;
  kind: string;
  label: string;
  created_by: string | null;
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
        createdBy: d.created_by,
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
 * Split the RLS-visible catalog for display by OWNERSHIP, not visibility:
 * "mine" = rows the current auth user created (their own kinds stay theirs
 * even when public); everything else visible (public system kinds + rows
 * granted by teammates) is the platform/library section. RLS already did the
 * authorization — this is purely a display partition.
 */
export function partitionShapes(
  entries: ShapeListEntry[],
  currentUserId: string | null,
): ShapeStudioSections {
  const mine: ShapeListEntry[] = [];
  const platform: ShapeListEntry[] = [];
  for (const entry of entries) {
    const owned =
      currentUserId !== null && entry.createdBy === currentUserId;
    (owned ? mine : platform).push(entry);
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
      .select("id,kind,label,created_by,is_active,visibility,metadata,version,updated_at")
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
