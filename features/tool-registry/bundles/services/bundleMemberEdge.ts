// features/tool-registry/bundles/services/bundleMemberEdge.ts
//
// Tool ↔ bundle membership used to live in a dedicated `tool` junction table.
// That junction collapsed into `platform.associations` (2026-07-02, worklog
// §4.3): each membership is now a `tool → tool_bundle` edge with role='member',
// `position` = the old sort_order, and `metadata.local_alias` = the old alias.
//
// This module is the SINGLE place that reconstructs the legacy member-row shape
// from an association edge, so every bundle reader (bundles.service,
// dimensions.service, surfaces.service) maps edges the same way. Reads/writes to
// `platform.associations` themselves go only through `associationsService`.

import type { ScopesRpcResult } from "@/features/scopes/types";
import { isJsonObject } from "@/types/json";
import type { Json } from "@/types/database.types";

/** Canonical association tokens for the tool → tool_bundle membership edge. */
export const TOOL = "tool";
export const TOOL_BUNDLE = "tool_bundle";
/** The membership edge's role in `platform.associations`. */
export const BUNDLE_MEMBER_ROLE = "member";

/**
 * The legacy junction row shape, reconstructed from an association edge. Kept
 * byte-identical to the old generated Row (all non-null) so the bundle-picker
 * components consuming it need no changes.
 */
export interface BundleMemberRow {
  bundle_id: string;
  tool_id: string;
  local_alias: string;
  sort_order: number;
  created_at: string;
}

/**
 * The subset of an association edge this reconstruction needs. Both
 * `AssociationSourceEdge` (from `listForSources`) and `AssociationTargetEdge`
 * (from `listForTargets`) satisfy it: for a tool → tool_bundle edge the source
 * is always the tool and the target always the bundle.
 */
export interface BundleMemberEdge {
  /** The member tool's id (association source). */
  sourceId: string;
  /** The bundle's id (association target). */
  targetId: string;
  position: number | null;
  metadata: Json;
  createdAt: string;
}

/** Reconstruct a legacy member row from a tool → tool_bundle association edge. */
export function edgeToBundleMemberRow(e: BundleMemberEdge): BundleMemberRow {
  const meta = isJsonObject(e.metadata) ? e.metadata : {};
  return {
    bundle_id: e.targetId,
    tool_id: e.sourceId,
    local_alias: typeof meta.local_alias === "string" ? meta.local_alias : "",
    sort_order: e.position ?? 0,
    created_at: e.createdAt,
  };
}

/**
 * Unwrap a never-throwing `associationsService` result into the tool services'
 * throwing contract (they `throw` on error; the service returns a result). Mirror
 * of the same helper in `features/research/service.ts`.
 */
export function assocData<T>(r: ScopesRpcResult<T>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
