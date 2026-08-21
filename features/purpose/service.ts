// features/purpose/service.ts
//
// THE PURPOSE REGISTRY — this repo's half. C-20 of the Dynamic Agent Graph
// program. Cross-repo system of record:
// /Users/armanisadeghi/code/common-docs/systems/platform/purpose-registry/FEATURE.md
//
// Engram §3.3 makes purpose mandatory on every unit of work — NO PURPOSE, NO
// BUILD. A purpose says WHY a unit exists; the output schema already says what
// shape its answer takes.
//
// 🚨 PURPOSE TEXT LIVES IN `platform.purpose`, NEVER ON AN ASSOCIATION EDGE.
// The edge is `(purpose) -role 'served_by'-> (unit)` and carries `role` +
// `position` only (0 = primary). Edge metadata is unversioned and unstamped —
// putting the statement there is exactly the roster-`gap` hole this registry
// replaced (D-2). If you are about to write a purpose string into
// `associations.metadata`, stop.
//
// This service holds NO invariant logic. One-primary-per-unit and the Engram
// §4.5 anti-stacking guard live in `platform.upsert_unit_purpose`, because
// aidream writes purposes too and two implementations of one invariant is two
// invariants. Reads go DIRECT to Supabase like every other data read.

"use client";

import { supabase } from "@/utils/supabase/client";
import { err, mapPgError, mapPgErrorPair, ok } from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult } from "@/features/scopes/types";
import type { Json } from "@/types/database.types";

/** Engram §4.5 grounding: human-authored · AI-drafted-human-verified · AI-only. */
export type GroundingTag = "H" | "V" | "A";

/** The units that can carry a purpose. Mirrors the DB function's own check. */
export type PurposeUnitType = "agent" | "workflow" | "tool";

export type Purpose = {
  id: string;
  title: string;
  statement: string;
  inputs: Json;
  outputs: Json;
  safeConditions: Json | null;
  groundingTag: GroundingTag;
  organizationId: string;
  version: number;
};

export type PurposeCoverage = {
  unitType: string;
  organizationId: string | null;
  totalUnits: number;
  withPurpose: number;
  missingPurpose: number;
  groundingH: number;
  groundingV: number;
  groundingA: number;
};

export type OrphanedPurpose = {
  purposeId: string;
  title: string;
  statement: string;
  groundingTag: GroundingTag;
  organizationId: string | null;
  updatedAt: string;
};

function isGroundingTag(value: unknown): value is GroundingTag {
  return value === "H" || value === "V" || value === "A";
}

type PurposeRow = {
  id: string;
  title: string;
  statement: string;
  inputs: Json;
  outputs: Json;
  safe_conditions: Json | null;
  grounding_tag: string;
  organization_id: string;
  version: number;
};

function rowToPurpose(r: PurposeRow): Purpose {
  return {
    id: r.id,
    title: r.title,
    statement: r.statement,
    inputs: r.inputs,
    outputs: r.outputs,
    safeConditions: r.safe_conditions,
    // The column is CHECK-constrained to the three tags; anything else means
    // the DB and this type have diverged, and reading it as "A" would silently
    // understate grounding. Fail visibly instead.
    groundingTag: isGroundingTag(r.grounding_tag) ? r.grounding_tag : "A",
    organizationId: r.organization_id,
    version: r.version,
  };
}

export const purposeService = {
  /**
   * Write (or update) a unit's purpose at `position` (0 = primary).
   *
   * ⚠️ THE ANTI-STACKING GUARD DOES NOT ERROR. Offering an `A` statement for a
   * unit whose purpose is already `H` or `V` is REFUSED and the EXISTING row
   * comes back — an AI may not overwrite human grounding (Engram §4.5). Compare
   * `data.groundingTag` if you need to know which happened; treating success as
   * "my text landed" is wrong.
   */
  async upsertForUnit(args: {
    unitType: PurposeUnitType;
    unitId: string;
    title: string;
    statement: string;
    groundingTag: GroundingTag;
    inputs?: Json;
    outputs?: Json;
    safeConditions?: Json;
    position?: number;
  }): Promise<ScopesRpcResult<Purpose>> {
    try {
      const { data, error } = await supabase.schema("platform").rpc("upsert_unit_purpose", {
        p_unit_type: args.unitType,
        p_unit_id: args.unitId,
        p_title: args.title,
        p_statement: args.statement,
        p_grounding_tag: args.groundingTag,
        p_inputs: args.inputs ?? undefined,
        p_outputs: args.outputs ?? undefined,
        p_safe_conditions: args.safeConditions ?? undefined,
        p_position: args.position ?? 0,
      });
      if (error) return err(...mapPgErrorPair(error));
      const row = (Array.isArray(data) ? data[0] : data) as PurposeRow | null;
      if (!row) {
        return err("internal", "upsert_unit_purpose returned no purpose row");
      }
      return ok(rowToPurpose(row));
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** The unit's purpose at `position` (0 = primary), or null. */
  async forUnit(
    unitType: PurposeUnitType,
    unitId: string,
    position = 0,
  ): Promise<ScopesRpcResult<Purpose | null>> {
    try {
      const { data, error } = await supabase.schema("platform").rpc("purpose_for_unit", {
        p_unit_type: unitType,
        p_unit_id: unitId,
        p_position: position,
      });
      if (error) return err(...mapPgErrorPair(error));
      const row = (Array.isArray(data) ? data[0] : data) as PurposeRow | null;
      // A row-returning function with no match yields one all-NULL row.
      return ok(row && row.id ? rowToPurpose(row) : null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * "No purpose, no build" coverage + the grounding-debt profile, one row per
   * (unit kind, org). Grounding debt is tracked like tech debt — visible and
   * prioritized (Engram §4.5).
   */
  async coverage(): Promise<ScopesRpcResult<PurposeCoverage[]>> {
    try {
      const { data, error } = await supabase
        .schema("platform")
        .from("v_unit_purpose_coverage")
        .select("*");
      if (error) return err(...mapPgErrorPair(error));
      return ok(
        (data ?? []).map((r) => ({
          unitType: r.unit_type ?? "",
          organizationId: r.organization_id,
          totalUnits: Number(r.total_units ?? 0),
          withPurpose: Number(r.with_purpose ?? 0),
          missingPurpose: Number(r.missing_purpose ?? 0),
          groundingH: Number(r.grounding_h ?? 0),
          groundingV: Number(r.grounding_v ?? 0),
          groundingA: Number(r.grounding_a ?? 0),
        })),
      );
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** The units behind the `missingPurpose` count — a count is a door. */
  async unitsWithoutPurpose(
    unitType?: PurposeUnitType,
    limit = 200,
  ): Promise<
    ScopesRpcResult<
      { unitType: string; unitId: string; name: string | null; organizationId: string | null }[]
    >
  > {
    try {
      let query = supabase
        .schema("platform")
        .from("v_units_without_purpose")
        .select("*")
        .limit(limit);
      if (unitType) query = query.eq("unit_type", unitType);
      const { data, error } = await query;
      if (error) return err(...mapPgErrorPair(error));
      return ok(
        (data ?? []).map((r) => ({
          unitType: r.unit_type ?? "",
          unitId: r.unit_id ?? "",
          name: r.name,
          organizationId: r.organization_id,
        })),
      );
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Purposes with zero live `served_by` edges.
   *
   * These are FINDINGS — "nothing serves this job anymore" — never litter. The
   * job outlives the unit, so nothing here is ever garbage-collected (D-2).
   */
  async orphaned(limit = 200): Promise<ScopesRpcResult<OrphanedPurpose[]>> {
    try {
      const { data, error } = await supabase
        .schema("platform")
        .from("v_purpose_orphaned")
        .select("*")
        .limit(limit);
      if (error) return err(...mapPgErrorPair(error));
      return ok(
        (data ?? []).map((r) => ({
          purposeId: r.purpose_id ?? "",
          title: r.title ?? "",
          statement: r.statement ?? "",
          groundingTag: isGroundingTag(r.grounding_tag) ? r.grounding_tag : "A",
          organizationId: r.organization_id,
          updatedAt: r.updated_at ?? "",
        })),
      );
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
