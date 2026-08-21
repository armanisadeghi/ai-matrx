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
  /** Machine-minted I/O contract bookkeeping row — never a browsable shape. */
  is_contract_artifact: boolean;
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
 * Machine-minted contract rows (`is_contract_artifact`, the first-class DB
 * flag) are EXCLUDED — they are generated I/O bookkeeping, not shapes a user
 * browses, previews, or tests. Human-named kinds in the workflow_io family
 * (agent_result, scraped_page, json, …) ARE browsable shapes — the old
 * family-based heuristic wrongly hid them and is gone.
 *
 * POST-EVICTION (2026-08-20): the ~986 contract rows this filter was written
 * for were moved to `content_ir.io_contract` and soft-deleted out of the
 * registry, and auto-minting is deleted, so on live data this predicate now
 * matches nothing. It is KEPT as a backstop — an empty quarantine is cheap,
 * re-drift is not. The server-side catalog (aidream
 * `services/runtime/kind_catalog.py`) loads rows UNFILTERED and logs an error
 * if it ever finds one, so the detection lives there rather than costing this
 * UI path an extra round trip.
 * Authority: common-docs KINDS_EVERYWHERE_PLAN.md §10b item 5.
 */
export function buildShapeStudioList(
  defs: ShapeDefinitionRowLite[],
  activeComponentDefinitionIds: ReadonlySet<string>,
): ShapeListEntry[] {
  return defs
    .filter((d) => !d.is_contract_artifact)
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
      .select(
        "id,kind,label,created_by,is_active,is_contract_artifact,visibility,metadata,version,updated_at",
      )
      .is("deleted_at", null)
      // Machine-minted I/O contract bookkeeping rows (tool_io_*_<hash8>_*)
      // never reach the shape gallery — real, human-named shapes only.
      // Since the 2026-08-20 eviction this excludes ZERO live rows; kept as a
      // backstop against re-drift.
      .eq("is_contract_artifact", false),
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
