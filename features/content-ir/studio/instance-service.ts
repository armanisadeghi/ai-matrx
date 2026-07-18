/**
 * Kind-instance service — the ONE browser write/read path for
 * `content_ir.kind_instance` (the P-1 persistence contract, frontend side).
 *
 * Direct supabase-js against the live table — RLS (canonical std_* policies +
 * owner short-circuit) is the authorization layer; never route these through
 * Python. Mirrors the aidream `instance_*` toolset semantics EXACTLY so the
 * two write paths can never disagree:
 *
 *   - `data` stores PURE data — a root `__kind` marker is stripped before
 *     write (parsers re-add envelopes; storage is payload-only).
 *   - `title` is app-derived (see `./instance-title.ts` — explicit → the
 *     kind's `metadata.title_key` override → the shared `INSTANCE_TITLE_KEYS`
 *     list, mirroring the server's `derive_title`) unless explicit.
 *   - `kind_version` pins the kind's CURRENT version at write time.
 *   - `validation_status` is DERIVED by the DB BEFORE trigger — every write
 *     here reads the verdict back and returns it as the truth. A client-side
 *     "valid" that the trigger contradicts is a validator-drift DEFECT the
 *     caller must scream about (see `isValidatorDrift`).
 *   - Repin (`repinToCurrent`) follows P-1's honest rule: the data MUST
 *     validate against the CURRENT schema or the repin is refused loudly —
 *     never a blind version bump.
 *
 * All functions throw `Error` with a human-readable message on failure; no
 * silent nulls.
 */

import { supabase } from "@/utils/supabase/client";
import { KIND_KEY } from "../core/kind-schema.types";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { deriveInstanceTitle } from "./instance-title";
import type { Json } from "@/types/database.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Root-level `__kind` removed — instances store pure data (server parity). */
export function stripRootKind(value: Record<string, unknown>): Record<string, unknown> {
  if (!(KIND_KEY in value)) return value;
  const { [KIND_KEY]: _dropped, ...rest } = value;
  void _dropped;
  return rest;
}

export interface KindInstanceWriteResult {
  id: string;
  title: string | null;
  /** The DB trigger's derived verdict — the TRUTH, read back after write. */
  validationStatus: string;
  kindVersion: number;
}

/**
 * True when the trigger's verdict contradicts a client-side ajv pass — a
 * validator-drift defect: `captureError` it AND show the user; never hide.
 */
export function isValidatorDrift(result: KindInstanceWriteResult): boolean {
  return result.validationStatus !== "passed";
}

export interface SaveKindInstanceArgs {
  /** `content_ir.kind_definition.id` of the kind being instantiated. */
  kindDefinitionId: string;
  /** The kind's CURRENT `version` — pinned onto the instance at write. */
  kindVersion: number;
  /** The instance value (may carry a root `__kind`; stripped before write). */
  value: Record<string, unknown>;
  /** The CALLER's active org (never the kind's org). Required by contract. */
  organizationId: string | null;
  /** Explicit display title; derived from the data when omitted. */
  title?: string | null;
  /**
   * The kind's `metadata.title_key` override (see `./instance-title.ts`) —
   * pass `kindTitleKeyFromMetadata(kind_definition.metadata)` so per-kind
   * title fields (e.g. wine_tasting's `wine_name`) derive a title.
   */
  titleKey?: string | null;
}

/**
 * Insert ONE instance and read the trigger's verdict back. Throws on any DB
 * failure (including a missing org — the caller must have an active org).
 */
export async function saveKindInstance(
  args: SaveKindInstanceArgs,
): Promise<KindInstanceWriteResult> {
  const { kindDefinitionId, kindVersion, value, organizationId, title, titleKey } = args;
  if (!organizationId) {
    throw new Error(
      "No active organization — cannot save the instance. Select an organization and retry.",
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    throw new Error("Not signed in — cannot save the instance.");
  }

  const data = stripRootKind(value);
  const { data: row, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .insert({
      kind_definition_id: kindDefinitionId,
      kind_version: kindVersion,
      data: data as Json,
      title: deriveInstanceTitle(data, title, titleKey),
      organization_id: organizationId,
      created_by: userId,
    })
    .select("id,title,validation_status,kind_version")
    .single();
  if (error) {
    throw new Error(`Failed to save the instance: ${error.message}`);
  }
  return {
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
  };
}

export interface KindInstanceListEntry {
  id: string;
  title: string | null;
  validationStatus: string;
  kindVersion: number;
  updatedAt: string;
  data: Json;
}

/**
 * MY instances of one kind — created_by = me, live rows only, newest-updated
 * first. RLS already scopes visibility; the created_by filter is the display
 * contract ("my instances"), mirroring the server `instance_list` projection
 * (+ `data`, so the tab renders without a second fetch per row).
 */
export async function listMyKindInstances(
  kindDefinitionId: string,
): Promise<KindInstanceListEntry[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in — cannot list instances.");

  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .select("id,title,validation_status,kind_version,updated_at,data")
    .eq("kind_definition_id", kindDefinitionId)
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to list instances: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
    updatedAt: row.updated_at,
    data: row.data,
  }));
}

export interface UpdateKindInstanceArgs {
  id: string;
  /** Full replacement payload (root `__kind` stripped before write). */
  value: Record<string, unknown>;
  /** The kind's `metadata.title_key` override — same contract as save. */
  titleKey?: string | null;
}

async function currentUserId(): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in.");
  return userId;
}

/** Update an instance's data (+ re-derived title); read the verdict back. */
export async function updateKindInstance(
  args: UpdateKindInstanceArgs,
): Promise<KindInstanceWriteResult> {
  const data = stripRootKind(args.value);
  const { data: row, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .update({
      data: data as Json,
      title: deriveInstanceTitle(data, null, args.titleKey),
      updated_by: await currentUserId(),
    })
    .eq("id", args.id)
    .select("id,title,validation_status,kind_version")
    .single();
  if (error) {
    throw new Error(`Failed to update the instance: ${error.message}`);
  }
  return {
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
  };
}

export interface RepinKindInstanceArgs {
  id: string;
  /** The instance's CURRENT stored data (pure, no `__kind`). */
  data: Record<string, unknown>;
  /** The kind's current `version` to pin onto. */
  currentVersion: number;
  /** The kind's current `emitted_json_schema` — the honesty gate. */
  emittedJsonSchema: Json | null;
}

/**
 * Repin a stale-pinned instance onto the kind's CURRENT version — P-1's
 * honest rule: the data MUST validate against the current schema first;
 * refused loudly otherwise (throws with the ajv detail). Never a blind bump.
 */
export async function repinKindInstance(
  args: RepinKindInstanceArgs,
): Promise<KindInstanceWriteResult> {
  const leg = validateStructuralLeg(args.data, args.emittedJsonSchema);
  if (!leg.ok) {
    throw new Error(
      `Repin refused — the data does not validate against the CURRENT schema (v${args.currentVersion}): ${leg.detail ?? "validation failed"}. Edit the instance to match the current schema, then repin.`,
    );
  }
  const { data: row, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .update({ kind_version: args.currentVersion, updated_by: await currentUserId() })
    .eq("id", args.id)
    .select("id,title,validation_status,kind_version")
    .single();
  if (error) {
    throw new Error(`Failed to repin the instance: ${error.message}`);
  }
  return {
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
  };
}

/** Soft delete (platform tombstone) — `deleted_at` set, row retained. */
export async function softDeleteKindInstance(id: string): Promise<void> {
  const { error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .update({ deleted_at: new Date().toISOString(), updated_by: await currentUserId() })
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to delete the instance: ${error.message}`);
  }
}

/** Narrow a stored `data` Json to the record shape the renderers consume. */
export function instanceDataAsRecord(data: Json): Record<string, unknown> | null {
  return isRecord(data) ? data : null;
}
