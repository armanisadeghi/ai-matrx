/**
 * Kind-instance service — the ONE browser write/read path for
 * `content_ir.kind_instance` (the P-1 persistence contract, frontend side).
 *
 * Direct supabase-js against the live table — RLS (canonical std_* policies +
 * owner short-circuit) is the authorization layer; never route these through
 * Python. Mirrors the aidream `instance_*` toolset semantics EXACTLY so the
 * two write paths can never disagree:
 *
 *   - `data` stores the marker: `__kind` is PART OF THE DATA
 *     (KINDS_EVERYWHERE_PLAN §4.2), stamped (or corrected) as the FIRST key on
 *     every write so a stored row can never forget what it is. Nothing here
 *     strips it — the DB validation trigger tolerates the marker on its own
 *     (`content_ir.compute_example_validation`), and so does the server's
 *     `instance_*` toolset, which does exactly the same stamping.
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
import { KIND_KEY } from "@ai-matrx/content-ir";
import { validateStructuralLeg } from "@ai-matrx/content-ir";
import { deriveInstanceTitle } from "./instance-title";
import type { Json } from "@/types/database.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The value as a stored instance of `kind`: `__kind` set (or corrected) as the
 * FIRST key, everything else verbatim. The mirror of aidream's
 * `ensure_root_marker` — the two write paths stamp identically.
 */
export function withRootKindMarker(
  value: Record<string, unknown>,
  kind: string,
): Record<string, unknown> {
  const { [KIND_KEY]: _existing, ...rest } = value;
  void _existing;
  return { [KIND_KEY]: kind, ...rest };
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
  /**
   * The kind's version AS THE CALLER KNOWS IT (page-load snapshot). The save
   * re-reads the definition's LIVE version and pins THAT; this field only
   * detects a mid-session bump (`versionBumped` on the result).
   */
  kindVersion: number;
  /** The instance value. Its root `__kind` is stamped/corrected before write. */
  value: Record<string, unknown>;
  /**
   * The CALLER's org (never the kind's). Callers read
   * `selectEffectiveOrganizationId`, which falls back to the personal org —
   * so this is normally always set; null happens only pre-bootstrap, and the
   * throw in `saveKindInstance` is that backstop, not the norm.
   */
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

export interface SaveKindInstanceResult extends KindInstanceWriteResult {
  /**
   * True when the definition's live version differed from the caller's
   * snapshot (built mid-session, e.g. via the creator agent) — the instance
   * was pinned to the FRESH version (strictly better than a stale pin; the
   * trigger validates against it). Callers surface a small notice.
   */
  versionBumped: boolean;
}

/** Live `version` + `emitted_json_schema` of a definition — freshness read. */
async function fetchLiveDefinition(
  kindDefinitionId: string,
): Promise<{ kind: string; version: number; emittedJsonSchema: Json | null }> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("kind,version,emitted_json_schema")
    .eq("id", kindDefinitionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read the kind definition: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "The kind definition no longer resolves (deleted or access revoked).",
    );
  }
  return {
    kind: data.kind,
    version: data.version,
    emittedJsonSchema: data.emitted_json_schema,
  };
}

/**
 * Insert ONE instance pinned to the definition's LIVE version (re-read at
 * save time — never the page-load snapshot) and read the trigger's verdict
 * back. Throws on any DB failure.
 */
export async function saveKindInstance(
  args: SaveKindInstanceArgs,
): Promise<SaveKindInstanceResult> {
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

  const live = await fetchLiveDefinition(kindDefinitionId);
  const data = withRootKindMarker(value, live.kind);
  const { data: row, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .insert({
      kind_definition_id: kindDefinitionId,
      kind_version: live.version,
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
    versionBumped: live.version !== kindVersion,
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
  /** Full replacement payload. Its root `__kind` is stamped before write. */
  value: Record<string, unknown>;
  /** The kind's `metadata.title_key` override — same contract as save. */
  titleKey?: string | null;
}

/** The kind slug an instance row is pinned to. Throws if it no longer resolves. */
async function instanceKindSlug(instanceId: string): Promise<string> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .select("kind_definition:kind_definition_id(kind)")
    .eq("id", instanceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read the instance's kind: ${error.message}`);
  }
  const kind = (data?.kind_definition as { kind?: string } | null)?.kind;
  if (!kind) {
    throw new Error("The instance's kind no longer resolves (deleted or access revoked).");
  }
  return kind;
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
  // The kind is re-read from the row being updated, never trusted from the
  // caller — the marker written must be the row's ACTUAL kind.
  const data = withRootKindMarker(args.value, await instanceKindSlug(args.id));
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
  /** The instance's CURRENT stored data (marker included — it is the data). */
  data: Record<string, unknown>;
  /**
   * The instance's kind — the LIVE version + `emitted_json_schema` are
   * re-read here at repin time, never trusted from a page-load snapshot.
   */
  kindDefinitionId: string;
}

/**
 * Repin a stale-pinned instance onto the kind's LIVE current version — P-1's
 * honest rule: the data MUST validate against the current schema first;
 * refused loudly otherwise (throws with the ajv detail). Never a blind bump.
 */
export async function repinKindInstance(
  args: RepinKindInstanceArgs,
): Promise<KindInstanceWriteResult> {
  const live = await fetchLiveDefinition(args.kindDefinitionId);
  const leg = validateStructuralLeg(args.data, live.emittedJsonSchema);
  if (!leg.ok) {
    throw new Error(
      `Repin refused — the data does not validate against the CURRENT schema (v${live.version}): ${leg.detail ?? "validation failed"}. Edit the instance to match the current schema, then repin.`,
    );
  }
  const { data: row, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .update({ kind_version: live.version, updated_by: await currentUserId() })
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
