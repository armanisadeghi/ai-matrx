// features/scopes/service/favoritesService.ts
//
// THE SOLE CHOKEPOINT for per-user entity state — `platform.user_entity_state`
// (the caller's favorite / pinned / hidden flags + recency on any entity).
//
// Mirrors `associationsService`: the client has NO direct grant on the
// `platform` schema, so every read/write goes through the four PUBLIC
// SECURITY-DEFINER RPCs (`ues_set` / `ues_list` / `ues_get_bulk` / `ues_touch`)
// — and every call to those RPCs goes through THIS file. No other file calls
// them. Methods always return a `ScopesRpcResult` and NEVER throw.
//
// Scope: unlike associations (org-gated), per-user state is gated on
// `auth.uid()` INSIDE each RPC — these are the user's own flags on an entity,
// across every org. `entity_type` is free text in the DB (the table tracks
// state for non-graph things too, e.g. `"nav"` destinations), so callers pass
// a canonical `EntityType` token where one exists, or another stable token.

"use client";

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  err,
  mapPgError,
  mapPgErrorPair,
  ok,
} from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult, UserEntityState } from "@/features/scopes/types";

/** The three boolean dimensions of per-user state, as accepted by `ues_list`. */
export type UserStateKind = "favorite" | "pinned" | "hidden";

// Raw `ues_list` row (snake_case, straight from PG). Carries `entity_type`.
interface UesListRow {
  entity_type: string;
  entity_id: string;
  is_favorite: boolean;
  is_pinned: boolean;
  is_hidden: boolean;
  last_viewed_at: string | null;
  updated_at: string;
}

// Raw `ues_get_bulk` row — scoped to one known `entity_type` (not echoed back).
interface UesBulkRow {
  entity_id: string;
  is_favorite: boolean;
  is_pinned: boolean;
  is_hidden: boolean;
  last_viewed_at: string | null;
}

function toState(row: UesListRow): UserEntityState {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    isFavorite: row.is_favorite,
    isPinned: row.is_pinned,
    isHidden: row.is_hidden,
    lastViewedAt: row.last_viewed_at ?? null,
  };
}

// ─── service ────────────────────────────────────────────────────────

export const favoritesService = {
  // ──────────────────────────────────────────────────────────────────
  //  WRITE — upsert one or more flags on (entityType, entityId).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Upsert the caller's state row for one entity. An OMITTED flag is left
   * UNCHANGED (the RPC `coalesce`s null → existing), so you can flip just
   * `isFavorite` without clobbering `isPinned`/`isHidden`. Idempotent.
   */
  async setState(args: {
    entityType: string;
    entityId: string;
    isFavorite?: boolean;
    isPinned?: boolean;
    isHidden?: boolean;
  }): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("ues_set", {
        p_entity_type: args.entityType,
        p_entity_id: args.entityId,
        p_is_favorite: args.isFavorite,
        p_is_pinned: args.isPinned,
        p_is_hidden: args.isHidden,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Convenience: flip ONLY the favorite flag (leaves pinned/hidden intact). */
  async setFavorite(
    entityType: string,
    entityId: string,
    isFavorite: boolean,
  ): Promise<ScopesRpcResult<null>> {
    return favoritesService.setState({ entityType, entityId, isFavorite });
  },

  /** Convenience: flip ONLY the pinned flag. */
  async setPinned(
    entityType: string,
    entityId: string,
    isPinned: boolean,
  ): Promise<ScopesRpcResult<null>> {
    return favoritesService.setState({ entityType, entityId, isPinned });
  },

  /** Convenience: flip ONLY the hidden flag. */
  async setHidden(
    entityType: string,
    entityId: string,
    isHidden: boolean,
  ): Promise<ScopesRpcResult<null>> {
    return favoritesService.setState({ entityType, entityId, isHidden });
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — all of my state rows of a kind (or every row).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Every state row the caller owns, optionally filtered to a single
   * dimension (`"favorite"` | `"pinned"` | `"hidden"`). Pass nothing for all.
   */
  async list(
    kind?: UserStateKind,
  ): Promise<ScopesRpcResult<{ items: UserEntityState[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("ues_list", {
        p_kind: kind,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as UesListRow[];
      return ok({ items: rows.map(toState) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — flags for a known set of ids of ONE type (list surfaces).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Bulk-fetch the caller's flags for `entityIds` of one `entityType` — the
   * read a list view uses to paint its star column in one round-trip. Only
   * entities that HAVE a state row come back; absent ids mean "no state yet".
   */
  async getBulk(
    entityType: string,
    entityIds: string[],
  ): Promise<ScopesRpcResult<{ items: UserEntityState[] }>> {
    try {
      requireUserId();
      const ids = Array.from(new Set(entityIds));
      const { data, error } = await supabase.rpc("ues_get_bulk", {
        p_entity_type: entityType,
        p_entity_ids: ids,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as UesBulkRow[];
      // `ues_get_bulk` doesn't echo entity_type (it's a query input) — stamp
      // it back so callers get the same `UserEntityState` shape as `list`.
      return ok({
        items: rows.map((r) => ({
          entityType,
          entityId: r.entity_id,
          isFavorite: r.is_favorite,
          isPinned: r.is_pinned,
          isHidden: r.is_hidden,
          lastViewedAt: r.last_viewed_at ?? null,
        })),
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — recency bump (no flag change).
  // ──────────────────────────────────────────────────────────────────

  /** Stamp `last_viewed_at = now()` for the entity (creates the row if absent). */
  async touch(
    entityType: string,
    entityId: string,
  ): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("ues_touch", {
        p_entity_type: entityType,
        p_entity_id: entityId,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
