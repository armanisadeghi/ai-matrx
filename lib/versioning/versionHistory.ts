// lib/versioning/versionHistory.ts
//
// Thin, reusable client over the PLATFORM row-versioning system
// (`history.row_versions`) and its canonical RPCs. Every base entity that the
// platform version-trigger tracks (fc_set, fc_card, note, assessment, …) gets
// version history + restore through THIS one primitive — no per-feature copy of
// the RPC wiring. Reads/writes go direct via supabase-js (RLS-gated by the RPCs).
//
//   listVersions(type, id)          → get_version_history  → VersionEntry[]
//   getVersionSnapshot(type, id, n) → get_version_snapshot → the row jsonb
//   restoreVersion(type, id, n)     → restore_version      → new version number
//
// Never throws — every call returns a `VersionResult<T>` (supabase-service style).

"use client";

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

/** One entry in an entity's version history, newest-first. */
export interface VersionEntry {
  versionId: string;
  versionNumber: number;
  /** A human label for the row at that version (entity's display name). */
  name: string;
  /** Optional note describing the change (operation/actor summary). */
  changeNote: string;
  /** ISO timestamp the version was recorded. */
  changedAt: string;
}

export interface VersionResult<T> {
  data: T | null;
  error: string | null;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return "Unknown error";
}

function fail<T>(context: string, error: unknown): VersionResult<T> {
  console.error(`[versionHistory] ${context}:`, error);
  return { data: null, error: `${context}: ${describe(error)}` };
}

/**
 * The version history for one entity, newest-first. `entityType` is the
 * platform entity token (e.g. "fc_set", "fc_card"); `entityId` its UUID.
 */
export async function listVersions(
  entityType: string,
  entityId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<VersionResult<VersionEntry[]>> {
  try {
    const { data, error } = await supabase.rpc("get_version_history", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      ...(opts.limit != null ? { p_limit: opts.limit } : {}),
      ...(opts.offset != null ? { p_offset: opts.offset } : {}),
    });
    if (error) return fail("listVersions", error);
    const rows = (data ?? []).map((r) => ({
      versionId: r.version_id,
      versionNumber: r.version_number,
      name: r.name ?? "",
      changeNote: r.change_note ?? "",
      changedAt: r.changed_at,
    }));
    return { data: rows, error: null };
  } catch (e) {
    return fail("listVersions", e);
  }
}

/** The full row snapshot (jsonb) an entity had at a given version number. */
export async function getVersionSnapshot(
  entityType: string,
  entityId: string,
  version: number,
): Promise<VersionResult<Json>> {
  try {
    const { data, error } = await supabase.rpc("get_version_snapshot", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_version: version,
    });
    if (error) return fail("getVersionSnapshot", error);
    return { data: data ?? null, error: null };
  } catch (e) {
    return fail("getVersionSnapshot", e);
  }
}

/**
 * Restore an entity to a prior version (atomic, RLS-gated by the RPC). Returns
 * the NEW version number the restore produced (restoring is itself a new
 * version — history is append-only, nothing is destroyed).
 */
export async function restoreVersion(
  entityType: string,
  entityId: string,
  version: number,
): Promise<VersionResult<number>> {
  try {
    const { data, error } = await supabase.rpc("restore_version", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_version: version,
    });
    if (error) return fail("restoreVersion", error);
    return { data: typeof data === "number" ? data : null, error: null };
  } catch (e) {
    return fail("restoreVersion", e);
  }
}
