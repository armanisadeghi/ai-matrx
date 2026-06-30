// features/scopes/service/associationCandidates.ts
//
// "What can I attach?" — the generic candidate reader behind every association
// picker. Given an entity TOKEN, it resolves the backing table from the entity
// registry (generated `schema`/`table` + FE `titleColumn`) and reads the rows
// the current user may attach, as `{ id, title }`.
//
// Fully token-driven: NO per-entity code. Add a token's `titleColumn` to the
// registry overlay and its picker works. RLS is the real visibility gate; the
// `ownerColumn` (`created_by` by convention) just narrows to the user's rows.
//
// LOUD RECOVERY: if the owner-column filter hits a missing-column error (42703 —
// a divergent table the registry convention doesn't fit), it screams to the
// console and RETRIES with RLS-only filtering rather than surfacing a hard 400.
// A recovery firing means the registry overlay needs an `ownerColumn` override.
//
// Reads go DIRECT to Postgres via supabase-js (CLAUDE.md data-flow rule: pure
// table reads never round-trip through Python/Next).

import { supabase } from "@/utils/supabase/client";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface CandidateRecord {
  id: string;
  title: string;
}

export interface ListCandidatesArgs {
  token: EntityTypeToken;
  /** Scope to this owner's rows when the entity declares an owner column. */
  ownerId?: string | null;
  /** Case-insensitive title filter. */
  search?: string;
  limit?: number;
}

export type CandidatesResult =
  { ok: true; data: CandidateRecord[] } | { ok: false; error: string };

export async function listAssociationCandidates(
  args: ListCandidatesArgs,
): Promise<CandidatesResult> {
  const { token, ownerId, search, limit = 100 } = args;
  const info = getEntityInfo(token);

  if (!info.canListCandidates || !info.titleColumn) {
    const msg =
      `Entity "${token}" has no title column in the registry overlay — ` +
      `add one in features/scopes/registry/entityRegistry.ts before listing candidates`;
    console.error(`[listAssociationCandidates] ${msg}`);
    return { ok: false, error: msg };
  }
  const titleCol = info.titleColumn;

  // Dynamic schema/table read — mirrors the established org-inventory pattern:
  // cast the schema to a known literal so supabase-js accepts a runtime value,
  // then `as never` the table/column args. Row shape is unknown → cast on read.
  const db = (
    info.schema && info.schema !== "public"
      ? supabase.schema(info.schema as "files")
      : supabase
  ) as typeof supabase;

  const runQuery = async (applyOwnerFilter: boolean) => {
    let q = db
      .from(info.table as never)
      .select(`id, ${titleCol}`)
      .order(titleCol as never, { ascending: true })
      .limit(limit);
    if (applyOwnerFilter && info.ownerColumn && ownerId) {
      q = q.eq(info.ownerColumn as never, ownerId as never);
    }
    if (search && search.trim()) {
      q = q.ilike(titleCol as never, `%${search.trim()}%`);
    }
    return q;
  };

  try {
    const wantOwnerFilter = Boolean(info.ownerColumn && ownerId);
    let { data, error } = await runQuery(wantOwnerFilter);

    // Loud recovery: the owner column doesn't exist on this table. Scream, then
    // retry RLS-only so the picker still works instead of erroring out.
    if (error && error.code === "42703" && wantOwnerFilter) {
      console.error(
        `[listAssociationCandidates] owner column "${info.ownerColumn}" missing on ` +
          `${info.schema}.${info.table} for token "${token}" — add an ownerColumn ` +
          `override in entityRegistry.ts. Falling back to RLS-only listing.`,
        { token, error },
      );
      ({ data, error } = await runQuery(false));
    }

    if (error) {
      console.error("[listAssociationCandidates] query failed", {
        token,
        error,
      });
      return { ok: false, error: error.message };
    }
    const rows = (data as Array<Record<string, unknown>>) ?? [];
    return {
      ok: true,
      data: rows.map((r) => ({
        id: String(r.id),
        title: String(r[titleCol] ?? "").trim() || "Untitled",
      })),
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to load candidates";
    console.error("[listAssociationCandidates] exception", { token, err });
    return { ok: false, error: msg };
  }
}
