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
 *
 * TWO STORES, ONE QUESTION (lane FINAL-SWITCH-KINDS, 2026-09-27). The relation is
 * declared superseded by `custom.record`. Every function below asks
 * `./kind-record-home.ts` — the browser half of aidream's ONE kind-record door — which
 * store holds THIS organization's kind records. Today's table answers exactly as it
 * always has; an organization that has adopted the record store for this source reads
 * and writes its records through the store's own doors (`@ai-matrx/records`). The
 * document there is the legacy relation's own columns, key for key — the shape aidream's
 * server writers already store — so both writers fill one Table with one shape. The
 * store has no derived-on-write validation trigger, so on that arm the verdict is the
 * structural check THIS call ran (`passed` / `failed`), or `pending` when the kind has no
 * schema to check against — never promoted.
 */

import { supabase } from "@/utils/supabase/client";
import { tryWriteOne } from "@/utils/supabase/writeOne";
import { defaultListFilter, type ListScopeWord } from "@/lib/list-scope";
import {
  DEFAULT_ARCHIVE_FILTER,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { validateStructuralLeg } from "@ai-matrx/content-ir";
import { deriveInstanceTitle } from "./instance-title";
import {
  kindRecordClient,
  whereKindRecordsLive,
  type KindRecordHome,
} from "./kind-record-home";
import type { Json } from "@/types/database.types";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
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
  /**
   * The verdict `platform._stamp_actor_tier` reached from the CHANNEL this
   * write came in on — read back, never assumed. A person saving from the
   * browser gets `confirmed`; an agent or an undeclared server door gets
   * `unconfirmed`. Callers show this, and must never print their own guess.
   */
  confirmation: "confirmed" | "unconfirmed";
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
   * The CALLER's org (never the kind's). Callers read `selectOrganizationId`
   * — the EXPLICIT active organization, with no personal fallback — so null
   * means the user has not chosen one, and the throw in `saveKindInstance` is
   * the honest refusal every caller surfaces.
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
  /**
   * The row's `metadata` jsonb. The HOME of a record born in a conversation
   * rides here — `{ home: { conversation_id, message_id } }` — which is what
   * the chat block's record chrome and the conversation's reverse view both
   * read to find what a chat produced.
   */
  metadata?: Record<string, unknown> | null;
  /**
   * The chat message that produced this record, when there is one. On the record-store
   * arm the `produced_by` edge is written IN THE SAME TRANSACTION as the record
   * (`custom.record_write_graph`), exactly as aidream's server store does, and the result
   * says so (`producedByEdgeWritten`). Today's table ignores it: its edge is written by
   * `storeKindRecord` after the row, as it always was.
   */
  producedByMessageId?: string | null;
}

export interface SaveKindInstanceResult extends KindInstanceWriteResult {
  /**
   * True when the definition's live version differed from the caller's
   * snapshot (built mid-session, e.g. via the creator agent) — the instance
   * was pinned to the FRESH version (strictly better than a stale pin; the
   * trigger validates against it). Callers surface a small notice.
   */
  versionBumped: boolean;
  /** Which store holds the record — carried so an edit goes back to the same one. */
  home?: KindRecordHome;
  /** True when the `produced_by` edge was written with the record (record-store arm only). */
  producedByEdgeWritten?: boolean;
}

type RecordStoreHome = Extract<KindRecordHome, { store: "record" }>;

/** The verdict a record-store write carries: what THIS call checked, never promoted. */
function storeVerdict(data: unknown, emittedJsonSchema: Json | null): "passed" | "failed" | "pending" {
  if (emittedJsonSchema === null || emittedJsonSchema === undefined) return "pending";
  return validateStructuralLeg(data, emittedJsonSchema).ok ? "passed" : "failed";
}

function storeRefused(what: string, message: string): Error {
  return new Error(`Failed to ${what} in this organization's record store: ${message}`);
}

/** One record of the kind-record Table, as its document. Throws when it is not readable here. */
async function readStoreRecord(
  home: RecordStoreHome,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await kindRecordClient(home);
  const read = await client.recordRead({ record_id: id });
  if (!read.ok) throw storeRefused("read the instance", read.error.message);
  return read.data.document as Record<string, unknown>;
}

async function saveToRecordStore(
  home: RecordStoreHome,
  document: Record<string, unknown>,
  producedByMessageId: string | null | undefined,
): Promise<{ id: string; edge: boolean }> {
  const client = await kindRecordClient(home);
  if (producedByMessageId) {
    const written = await client.recordWriteGraph({
      table_id: home.tableId,
      parent: document,
      edges: [{ entity: "message", id: producedByMessageId, direction: "in", label: "produced_by" }],
    });
    if (!written.ok) throw storeRefused("save the instance", written.error.message);
    return { id: written.data.parent_id, edge: true };
  }
  const written = await client.recordWrite({ table_id: home.tableId, data: document });
  if (!written.ok) throw storeRefused("save the instance", written.error.message);
  return { id: written.data, edge: false };
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
  const {
    kindDefinitionId,
    kindVersion,
    value,
    organizationId,
    title,
    titleKey,
    metadata,
  } = args;
  if (!organizationId) {
    throw new Error(
      "No active organization — cannot save the instance. Select an organization and retry.",
    );
  }
  const { data: auth, error: authError } = await getClaimsUser(supabase);
  // Could-not-verify is transient and retryable; signed-out is settled.
  if (authError) {
    throw new Error(
      `We could not verify your sign-in just now (${authError.message}). Try again.`,
    );
  }
  const userId = auth.user?.id;
  if (!userId) {
    throw new Error("Not signed in — cannot save the instance.");
  }

  const live = await fetchLiveDefinition(kindDefinitionId);
  const data = withRootKindMarker(value, live.kind);
  const home = await whereKindRecordsLive(organizationId, userId);
  if (home.store === "record") {
    const verdict = storeVerdict(data, live.emittedJsonSchema);
    const derivedTitle = deriveInstanceTitle(data, title, titleKey);
    const saved = await saveToRecordStore(
      home,
      {
        kind_definition_id: kindDefinitionId,
        kind_version: live.version,
        data,
        title: derivedTitle,
        validation_status: verdict,
        created_by: userId,
        organization_id: organizationId,
        ...(metadata ? { metadata } : {}),
      },
      args.producedByMessageId,
    );
    return {
      id: saved.id,
      title: derivedTitle,
      validationStatus: verdict,
      kindVersion: live.version,
      // A person saving from the browser, declared to the store as that person.
      confirmation: "confirmed",
      versionBumped: live.version !== kindVersion,
      home,
      producedByEdgeWritten: saved.edge,
    };
  }
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
      ...(metadata ? { metadata: metadata as Json } : {}),
      // `confirmation` is NOT NULL and carries no catalog default — deliberately,
      // so an admitted table that loses its carrier trigger refuses the insert
      // rather than silently minting a row claiming a person confirmed it
      // (DD-131 slice 1). `platform._stamp_actor_tier` stamps it on every INSERT
      // from the CHANNEL, never from the payload (DD-131 §2.2 rule 3): a
      // signed-in browser write declares no `x-matrx-actor-tier` header, which
      // IS the declaration "a person is typing", and the row is born `confirmed`
      // with that person recorded. We pass nothing here — the generated Insert
      // type marks `confirmation` optional for exactly this reason
      // (`scripts/server-set-columns.json`), so there is no literal for the
      // trigger to overwrite and no second write path to drift from it.
    })
    .select("id,title,validation_status,kind_version,confirmation")
    .single();
  if (error) {
    throw new Error(`Failed to save the instance: ${error.message}`);
  }
  return {
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
    confirmation: row.confirmation,
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
  /** Non-null when the row is archived — the tab badges it rather than lying. */
  archivedAt: string | null;
  /** Which store answered this row — hand it back to update / repin / delete. */
  home?: KindRecordHome;
  /** The organization the row belongs to — the list spans every organization the person reaches. */
  organizationId?: string | null;
  organizationName?: string | null;
}

async function listFromRecordStore(
  home: RecordStoreHome,
  kindDefinitionId: string,
  archiveFilter: ArchiveFilterValue,
  createdBy: string | null,
): Promise<KindInstanceListEntry[]> {
  const client = await kindRecordClient(home);
  const filter: Record<string, string> = { kind_definition_id: kindDefinitionId };
  if (createdBy) filter.created_by = createdBy;
  const rows: Array<{ id: string; document: Record<string, unknown>; archivedAt: string | null }> = [];
  if (archiveFilter !== "archived") {
    const live = await client.list({ table_id: home.tableId, filter, limit: 1000 });
    if (!live.ok) throw storeRefused("list instances", live.error.message);
    for (const row of live.data.rows) {
      rows.push({ id: row.id, document: row.document as Record<string, unknown>, archivedAt: null });
    }
  }
  if (archiveFilter !== "active") {
    const gone = await client.listArchived({ table_id: home.tableId, limit: 1000 });
    if (!gone.ok) throw storeRefused("list archived instances", gone.error.message);
    for (const row of gone.data.rows) {
      const document = row.document as Record<string, unknown>;
      // The archived door takes no filter, so the same filter is applied to what it answered.
      if (Object.entries(filter).some(([key, value]) => String(document[key]) !== value)) continue;
      rows.push({ id: row.id, document, archivedAt: row.archivedAt });
    }
  }
  const updated = new Map<string, string>();
  if (rows.length > 0) {
    const headers = await client.recordHeaders({ ids: rows.map((r) => r.id) });
    if (!headers.ok) throw storeRefused("read when instances changed", headers.error.message);
    for (const header of headers.data) updated.set(header.id, header.updated_at);
  }
  return rows
    .map((row) => ({
      id: row.id,
      title: typeof row.document.title === "string" ? row.document.title : null,
      validationStatus:
        typeof row.document.validation_status === "string" ? row.document.validation_status : "pending",
      kindVersion: Number(row.document.kind_version ?? 0),
      updatedAt: updated.get(row.id) ?? row.archivedAt ?? "",
      data: (row.document.data ?? null) as Json,
      archivedAt: row.archivedAt,
      home,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * Instances of one kind — live rows, newest-updated first.
 *
 * 🚨 WHERE THIS LIST OPENS IS A REGISTRY WORD, NOT A LITERAL (DD-137b,
 * VISIBILITY-BY-CLASS §3.3). This function used to be `listMyKindInstances`
 * and hard-coded `.eq("created_by", userId)` as "the display contract". It is
 * the site the whole design came from: four people in one organization each
 * researched SEO keywords into `content_ir.kind_instance` and each of them saw
 * only their own — every one of those rows readable by every one of them the
 * whole time. The token is registered `default_list_scope = organization`, so
 * this screen opens on the organization's rows and "just mine" is one click
 * away (`scope`), never blocked.
 *
 * RLS is still the ceiling in BOTH scopes: this filter can only ever NARROW
 * what the database already allows, which is why it is not an access decision
 * and is kept apart from `data_class`.
 */
export async function listKindInstances(
  kindDefinitionId: string,
  archiveFilter: ArchiveFilterValue = DEFAULT_ARCHIVE_FILTER,
  scope?: ListScopeWord,
  /**
   * Only rows homed in this organization. The admin kind registry passes the
   * SYSTEM organization: an admin management page shows the platform's own
   * records, never a tenant's (Arman, 2026-09-26).
   */
  homeOrganizationId?: string,
  /**
   * The person's active organization — the one whose store is asked where its kind
   * records live. Without it (and without `homeOrganizationId`) the list reads today's
   * table, as it always did.
   */
  activeOrganizationId?: string | null,
): Promise<KindInstanceListEntry[]> {
  const { data: auth, error: authError } = await getClaimsUser(supabase);
  if (authError)
    throw new Error(
      `We could not verify your sign-in just now (${authError.message}). Try again.`,
    );
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in — cannot list instances.");

  const listScope = await defaultListFilter("content_ir_kind_instance", { userId, requested: scope });

  // THE PERSON'S INSTANCES ACROSS EVERY ORGANIZATION — never the header's selected
  // one. Two sources, merged and each row labelled with its organization:
  //   1. the OLD table, through the person-wide door `content_ir.kind_instances_everywhere`;
  //   2. the RECORD STORE, read per organization (each org that keeps its kind records there
  //      answers through its own kind-record Table, as this person) — HOW an instance lives
  //      there: see `listFromRecordStore`.
  // The selected organization only ever names WHICH store answers its own rows.
  void activeOrganizationId;
  const { data: def, error: defError } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("kind")
    .eq("id", kindDefinitionId)
    .maybeSingle();
  if (defError || !def) {
    throw new Error(
      `Failed to resolve the kind for this list${defError ? `: ${defError.message}` : "."}`,
    );
  }

  // Which organizations keep their kind records in the record store (they are read from
  // the store, so the old table's rows for them are not listed twice).
  const memberOrgs = await personOrganizations().catch((error: unknown) => {
    console.warn("[content-ir] could not list the person's organizations", error);
    return [] as Array<{ id: string; name: string }>;
  });
  const orgIds = homeOrganizationId ? [homeOrganizationId] : memberOrgs.map((o) => o.id);
  const names = new Map<string, string>(memberOrgs.map((o) => [o.id, o.name]));
  const storeHomes: RecordStoreHome[] = [];
  const settled = await Promise.all(
    orgIds.map(async (orgId) => {
      try {
        return { orgId, home: await whereKindRecordsLive(orgId, userId), failed: null as string | null };
      } catch (error) {
        return { orgId, home: null, failed: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  for (const r of settled) {
    if (r.home?.store === "record") storeHomes.push(r.home);
    else if (r.failed) console.warn("[content-ir] could not check where records live for", r.orgId, r.failed);
  }
  const storeOrgIds = new Set(storeHomes.map((h) => h.organizationId));

  const fromOlderTable = async (): Promise<KindInstanceListEntry[]> => {
    const listed: Array<{
      id: string;
      title: string | null;
      validation_status: string;
      kind_version: number;
      updated_at: string;
      archived_at: string | null;
      organization_id: string;
      organization_name: string | null;
      created_by: string | null;
    }> = [];
    const PAGE = 500;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.schema("content_ir").rpc(
        "kind_instances_everywhere" as never,
        {
          p_kind: def.kind,
          p_organization_id: homeOrganizationId ?? null,
          p_limit: PAGE,
          p_offset: offset,
          p_include_archived: archiveFilter !== "active",
        } as never,
      );
      if (error) throw new Error(`Failed to list instances: ${error.message}`);
      const body = data as unknown as {
        success?: boolean;
        instances?: typeof listed;
        total?: number;
      } | null;
      if (!body?.success) throw new Error("Failed to list instances: the list door refused.");
      listed.push(...(body.instances ?? []));
      if (listed.length >= (body.total ?? 0) || (body.instances ?? []).length === 0) break;
    }
    const wanted = listed.filter(
      (row) =>
        !storeOrgIds.has(row.organization_id) &&
        (archiveFilter !== "archived" || row.archived_at !== null) &&
        (homeOrganizationId || !listScope.ownerOnly || row.created_by === userId),
    );
    // The door carries the labels, not the payload: read the documents for exactly these
    // rows, through the list scope (a filter, never access).
    const dataById = new Map<string, Json>();
    for (let i = 0; i < wanted.length; i += 200) {
      const ids = wanted.slice(i, i + 200).map((row) => row.id);
      let query = supabase.schema("content_ir").from("kind_instance").select("id,data").in("id", ids);
      if (!homeOrganizationId) query = listScope.apply(query);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to list instances: ${error.message}`);
      for (const row of data ?? []) dataById.set(row.id, row.data);
    }
    return wanted
      .filter((row) => dataById.has(row.id))
      .map((row) => {
        if (row.organization_name) names.set(row.organization_id, row.organization_name);
        return {
          id: row.id,
          title: row.title,
          validationStatus: row.validation_status,
          kindVersion: row.kind_version,
          updatedAt: row.updated_at,
          data: dataById.get(row.id) ?? null,
          archivedAt: row.archived_at,
          organizationId: row.organization_id,
          organizationName: row.organization_name,
        };
      });
  };

  const [older, ...stores] = await Promise.all([
    fromOlderTable(),
    ...storeHomes.map(async (home) => {
      try {
        const rows = await listFromRecordStore(
          home,
          kindDefinitionId,
          archiveFilter,
          !homeOrganizationId && listScope.ownerOnly ? userId : null,
        );
        return rows.map((row) => ({ ...row, organizationId: home.organizationId }));
      } catch (error) {
        // The organization the person selected keeps its refusal loud; another
        // organization's refusal never hides the rest.
        if (home.organizationId === activeOrganizationId) throw error;
        console.warn("[content-ir] record store list failed for", home.organizationId, error);
        return [] as KindInstanceListEntry[];
      }
    }),
  ]);
  const orgNames = names;
  return [...older, ...stores.flat()]
    .map((row) => ({
      ...row,
      organizationName: row.organizationName ?? (row.organizationId ? (orgNames.get(row.organizationId) ?? null) : null),
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

async function personOrganizations(): Promise<Array<{ id: string; name: string }>> {
  const { getUserOrganizations } = await import("@/features/organizations/service");
  const orgs = await getUserOrganizations();
  return orgs.map((o) => ({ id: o.id, name: o.name }));
}

export interface UpdateKindInstanceArgs {
  id: string;
  /** Full replacement payload. Its root `__kind` is stamped before write. */
  value: Record<string, unknown>;
  /** The kind's `metadata.title_key` override — same contract as save. */
  titleKey?: string | null;
  /** The store the row was listed from (`KindInstanceListEntry.home`). Absent = today's table. */
  home?: KindRecordHome;
}

/** The kind slug a record-store document is pinned to, read live. */
async function recordKind(document: Record<string, unknown>): Promise<{
  kindDefinitionId: string;
  live: Awaited<ReturnType<typeof fetchLiveDefinition>>;
}> {
  const kindDefinitionId = String(document.kind_definition_id ?? "");
  if (!kindDefinitionId) {
    throw new Error("The instance's kind no longer resolves (deleted or access revoked).");
  }
  return { kindDefinitionId, live: await fetchLiveDefinition(kindDefinitionId) };
}

async function updateInRecordStore(
  home: RecordStoreHome,
  id: string,
  patch: Record<string, unknown>,
  what: string,
): Promise<KindInstanceWriteResult> {
  const client = await kindRecordClient(home);
  const written = await client.recordUpdate({ record_id: id, patch });
  if (!written.ok) throw storeRefused(what, written.error.message);
  const document = await readStoreRecord(home, id);
  return {
    id,
    title: typeof document.title === "string" ? document.title : null,
    validationStatus:
      typeof document.validation_status === "string" ? document.validation_status : "pending",
    kindVersion: Number(document.kind_version ?? 0),
    confirmation: "confirmed",
  };
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
  const { data: auth, error: authError } = await getClaimsUser(supabase);
  if (authError)
    throw new Error(
      `We could not verify your sign-in just now (${authError.message}). Try again.`,
    );
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in.");
  return userId;
}

/** Update an instance's data (+ re-derived title); read the verdict back. */
export async function updateKindInstance(
  args: UpdateKindInstanceArgs,
): Promise<KindInstanceWriteResult> {
  if (args.home?.store === "record") {
    const document = await readStoreRecord(args.home, args.id);
    const { live } = await recordKind(document);
    const data = withRootKindMarker(args.value, live.kind);
    const pinnedToCurrent = Number(document.kind_version) === live.version;
    return updateInRecordStore(
      args.home,
      args.id,
      {
        data,
        title: deriveInstanceTitle(data, null, args.titleKey),
        // Judged against the schema the instance is pinned to only when that IS the live
        // one; pinned behind it, the verdict is `pending` until a repin — never guessed.
        validation_status: pinnedToCurrent ? storeVerdict(data, live.emittedJsonSchema) : "pending",
      },
      "update the instance",
    );
  }
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
    .select("id,title,validation_status,kind_version,confirmation")
    .single();
  if (error) {
    throw new Error(`Failed to update the instance: ${error.message}`);
  }
  return {
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
    // An UPDATE never moves `confirmation` (the trigger's branch is INSERT
    // only — DD-131 §3: every transition is a named door). Read back, so a
    // caller shows the row's real state rather than a stale snapshot.
    confirmation: row.confirmation,
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
  /** The store the row was listed from (`KindInstanceListEntry.home`). Absent = today's table. */
  home?: KindRecordHome;
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
  if (args.home?.store === "record") {
    return updateInRecordStore(
      args.home,
      args.id,
      { kind_version: live.version, validation_status: "passed" },
      "repin the instance",
    );
  }
  const { data: row, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .update({ kind_version: live.version, updated_by: await currentUserId() })
    .eq("id", args.id)
    .select("id,title,validation_status,kind_version,confirmation")
    .single();
  if (error) {
    throw new Error(`Failed to repin the instance: ${error.message}`);
  }
  return {
    id: row.id,
    title: row.title,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
    confirmation: row.confirmation,
  };
}

/** Soft delete (platform tombstone) — `deleted_at` set, row retained. */
export async function softDeleteKindInstance(id: string, home?: KindRecordHome): Promise<void> {
  if (home?.store === "record") {
    // The store's delete is soft and reversible within the Table's retention.
    const client = await kindRecordClient(home);
    const done = await client.recordDelete({ record_id: id });
    if (!done.ok) throw storeRefused("delete the instance", done.error.message);
    return;
  }
  const { error } = await tryWriteOne(
    supabase
      .schema("content_ir")
      .from("kind_instance")
      .update({ deleted_at: new Date().toISOString(), updated_by: await currentUserId() })
      .eq("id", id)
      .select("id"),
    { action: "delete", noun: "instance" },
  );
  if (error) {
    throw new Error(`Failed to delete the instance: ${error.message}`);
  }
}

/** Narrow a stored `data` Json to the record shape the renderers consume. */
export function instanceDataAsRecord(data: Json): Record<string, unknown> | null {
  return isRecord(data) ? data : null;
}
