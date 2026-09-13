/**
 * The record service — the ONE browser read/write path for a kind instance
 * TREATED AS A RECORD (see `./kind-record-registry.ts`).
 *
 * Direct supabase-js against `content_ir` and `platform.associations`; RLS is
 * the authorization layer (never route a plain read/write through Python).
 *
 * ## Transitions are named doors, never column writes
 *
 * `confirmation` and the archive flag are NEVER `UPDATE`d from here. The
 * database refuses a client-set `confirmation` on insert and each transition is
 * a named RPC with its own authorization (`content_ir.confirm_kind_instances`,
 * `content_ir.archive_kind_instances`). This module exposes those doors and
 * nothing else, so a second write path cannot appear.
 *
 * ## Every failure comes back as a SENTENCE
 *
 * Nothing here returns a quiet null. A read that cannot answer returns
 * `{ ok: false, message }` written for a reader, because the chrome's contract
 * is that it is absent or honest — never a greyed-out button.
 */

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  storeKindRecord,
  PRODUCED_BY_LABEL as STORE_PRODUCED_BY_LABEL,
  MESSAGE_SOURCE_TYPE as STORE_MESSAGE_SOURCE_TYPE,
  KIND_INSTANCE_TARGET_TYPE as STORE_KIND_INSTANCE_TARGET_TYPE,
  type KindRecordProvenance,
} from "@/features/content-ir/studio/store-kind-record";

/** `platform.confirmation`. */
export type RecordConfirmation = "unconfirmed" | "confirmed";

export type RecordResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/**
 * The association contract, re-exported from THE ONE CLIENT STORE so the
 * reader and the writer can never name the edge differently.
 */
export const PRODUCED_BY_LABEL = STORE_PRODUCED_BY_LABEL;
export const MESSAGE_SOURCE_TYPE = STORE_MESSAGE_SOURCE_TYPE;
export const KIND_INSTANCE_TARGET_TYPE = STORE_KIND_INSTANCE_TARGET_TYPE;

// The record change bus lives in its own module so THE ONE CLIENT STORE can
// announce a write without importing this reader. Re-exported here because
// this is the module every record view already imports.
export {
  subscribeToKindRecordChanges,
  notifyKindRecordsChanged,
  type KindRecordsChangedListener,
} from "./record-change-bus";

import { notifyKindRecordsChanged } from "./record-change-bus";

export interface KindRecord {
  id: string;
  title: string | null;
  /** The kind slug this record instantiates. */
  kind: string;
  confirmation: RecordConfirmation;
  archivedAt: string | null;
  createdAt: string;
}

function fail(where: string, error: unknown): { ok: false; message: string } {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  captureError({
    source: "content-ir",
    message: `[kind-record-service] ${where}: ${detail}`,
    callSite: where,
    raw: error,
  });
  return { ok: false, message: detail };
}

function normalizeConfirmation(value: unknown): RecordConfirmation {
  return value === "confirmed" ? "confirmed" : "unconfirmed";
}

// ---------------------------------------------------------------------------
// Kind definition resolution
// ---------------------------------------------------------------------------

/**
 * slug → `kind_definition.id`, memoized for the app session. A kind's row id
 * never changes, and every read below needs it; the registry's own cold fetch
 * does not carry it, so this is the one small lookup that belongs here.
 */
const definitionIdBySlug = new Map<string, string>();

export async function resolveKindDefinitionId(
  kind: string,
): Promise<RecordResult<string>> {
  const cached = definitionIdBySlug.get(kind);
  if (cached) return { ok: true, value: cached };
  try {
    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id")
      .eq("kind", kind)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return fail(`resolveKindDefinitionId(${kind})`, error);
    if (!data) {
      return {
        ok: false,
        message: `No Shape named "${kind}" is registered, so its records cannot be counted.`,
      };
    }
    definitionIdBySlug.set(kind, data.id);
    return { ok: true, value: data.id };
  } catch (error) {
    return fail(`resolveKindDefinitionId(${kind})`, error);
  }
}

// ---------------------------------------------------------------------------
// Counting a kind's records in the viewer's organization
// ---------------------------------------------------------------------------

/**
 * How many records of `kind` this organization holds — ACTIVE only (archived
 * and deleted excluded), because the number stands next to a link labelled
 * "All N <plural>" and a count that includes rows the destination hides is a
 * false sentence.
 */
export async function countKindRecords(args: {
  kind: string;
  organizationId: string;
}): Promise<RecordResult<number>> {
  const definition = await resolveKindDefinitionId(args.kind);
  if (!definition.ok) return definition;
  try {
    const { count, error } = await supabase
      .schema("content_ir")
      .from("kind_instance")
      .select("id", { count: "exact", head: true })
      .eq("kind_definition_id", definition.value)
      .eq("organization_id", args.organizationId)
      .is("deleted_at", null)
      .is("archived_at", null);
    if (error) return fail(`countKindRecords(${args.kind})`, error);
    return { ok: true, value: count ?? 0 };
  } catch (error) {
    return fail(`countKindRecords(${args.kind})`, error);
  }
}

// ---------------------------------------------------------------------------
// The record a message produced
// ---------------------------------------------------------------------------

const INSTANCE_COLUMNS =
  "id,title,confirmation,archived_at,created_at,kind_definition_id";

interface RawInstanceRow {
  id: string;
  title: string | null;
  confirmation: string;
  archived_at: string | null;
  created_at: string;
  kind_definition_id: string;
}

/**
 * Every record of `kind` this MESSAGE produced, oldest first.
 *
 * TWO ROUTES, because there are two ways a record can come from a message and
 * neither is guaranteed:
 *
 *  - a `platform.associations` `produced_by` edge, which BOTH the server store
 *    and the client store (`studio/store-kind-record.ts`) write, and
 *  - `metadata.source.message_id`, written by both stores beside the edge.
 *
 * Both are read because they answer the same question from different rows and
 * an edge can be missing (the association insert was refused while the record
 * itself landed — the store says so out loud and the record still exists).
 *
 * 🚨 On the product's own chat screen the server route does not fire today
 * (the request carries no `block_mode`, V-42 §2.2), so in practice every wine
 * tasting is written by the client store. That is why the chrome's control has
 * to be an honest SAVE when neither route answers — a screen that claimed the
 * record was already there would be lying, on every wine tasting in every chat.
 */
export async function fetchRecordsProducedByMessage(args: {
  kind: string;
  messageId: string;
}): Promise<RecordResult<KindRecord[]>> {
  const definition = await resolveKindDefinitionId(args.kind);
  if (!definition.ok) return definition;
  try {
    const { data: edges, error: edgeError } = await supabase
      .schema("platform")
      .from("associations")
      .select("target_id")
      .eq("source_type", MESSAGE_SOURCE_TYPE)
      .eq("source_id", args.messageId)
      .eq("target_type", KIND_INSTANCE_TARGET_TYPE)
      .eq("label", PRODUCED_BY_LABEL)
      .is("deleted_at", null);
    if (edgeError) {
      return fail(`fetchRecordsProducedByMessage(${args.messageId})`, edgeError);
    }
    const ids = (edges ?? []).map((row) => row.target_id).filter(Boolean);

    const byId = new Map<string, RawInstanceRow>();
    if (ids.length > 0) {
      const { data, error } = await supabase
        .schema("content_ir")
        .from("kind_instance")
        .select(INSTANCE_COLUMNS)
        .in("id", ids)
        .eq("kind_definition_id", definition.value)
        .is("deleted_at", null);
      if (error) {
        return fail(`fetchRecordsProducedByMessage(${args.messageId})`, error);
      }
      for (const row of (data ?? []) as RawInstanceRow[]) byId.set(row.id, row);
    }

    // `metadata.source.message_id` — the canonical shape BOTH stores write.
    const homed = await supabase
      .schema("content_ir")
      .from("kind_instance")
      .select(INSTANCE_COLUMNS)
      .eq("metadata->source->>message_id", args.messageId)
      .eq("kind_definition_id", definition.value)
      .is("deleted_at", null);
    if (homed.error) {
      return fail(
        `fetchRecordsProducedByMessage(${args.messageId})`,
        homed.error,
      );
    }
    for (const row of (homed.data ?? []) as RawInstanceRow[]) {
      byId.set(row.id, row);
    }

    return {
      ok: true,
      value: [...byId.values()]
        .map((row) => ({
          id: row.id,
          title: row.title,
          kind: args.kind,
          confirmation: normalizeConfirmation(row.confirmation),
          archivedAt: row.archived_at,
          createdAt: row.created_at,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  } catch (error) {
    return fail(`fetchRecordsProducedByMessage(${args.messageId})`, error);
  }
}

/**
 * Save the block a person is looking at as a record of `kind`.
 *
 * Routes through THE ONE CLIENT STORE (`studio/store-kind-record.ts`) — the
 * same function the "Save to my Shapes" message action and the Shape Studio's
 * Test tab call — so the metadata shape and the `produced_by` edge can never
 * differ between two client saves, nor from what the server store writes.
 *
 * A PERSON is clicking, so this write declares no `x-matrx-actor-tier` header.
 * That is not an omission: on the `authenticated` channel the absence of the
 * header IS the declaration "a person did this" (`platform.declared_actor_tier`),
 * and the row is born `confirmed` with them recorded as the confirmer. Nothing
 * here may ever dress a client save up as an agent write.
 */
export async function saveRecordFromBlock(args: {
  kind: string;
  value: Record<string, unknown>;
  organizationId: string | null;
  conversationId?: string;
  messageId?: string;
  /** The block envelope's fingerprint, when the host could read one. */
  fingerprint?: string;
}): Promise<RecordResult<KindRecord & { provenanceWarning: string | null }>> {
  try {
    const { data: def, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id,kind,version,metadata")
      .eq("kind", args.kind)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return fail(`saveRecordFromBlock(${args.kind})`, error);
    if (!def) {
      return {
        ok: false,
        message: `The Shape "${args.kind}" is not readable from here, so this cannot be saved.`,
      };
    }

    const { kindTitleKeyFromMetadata } = await import(
      "@/features/content-ir/studio/instance-title"
    );
    const provenance: KindRecordProvenance = {
      conversationId: args.conversationId ?? null,
      messageId: args.messageId ?? null,
      fingerprint: args.fingerprint ?? null,
    };
    const saved = await storeKindRecord({
      kindDefinitionId: def.id,
      kindVersion: def.version,
      value: args.value,
      organizationId: args.organizationId,
      titleKey: kindTitleKeyFromMetadata(def.metadata),
      provenance,
    });
    definitionIdBySlug.set(def.kind, def.id);
    return {
      ok: true,
      value: {
        id: saved.id,
        title: saved.title,
        kind: args.kind,
        // The DB's verdict, read back — never this module's assumption.
        confirmation: saved.confirmation,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        provenanceWarning: saved.provenanceWarning,
      },
    };
  } catch (error) {
    return fail(`saveRecordFromBlock(${args.kind})`, error);
  }
}

// ---------------------------------------------------------------------------
// The reverse view: everything a conversation produced
// ---------------------------------------------------------------------------

/**
 * Every record this CONVERSATION produced, newest first — by either route:
 *
 *  - the record is HOMED in the conversation (`metadata.home.conversation_id`),
 *  - or it is the target of a `produced_by` edge from one of the
 *    conversation's messages.
 *
 * Both are read because they answer different questions and neither is
 * guaranteed present: a record can be homed without an edge (written by a later
 * tool call) and edged without a home (re-homed by the user). The union is the
 * honest answer to "what did this chat produce?".
 *
 * ARCHIVED ROWS ARE INCLUDED and flagged; the caller filters. The archive
 * control needs the true archived count to render (THE ARCHIVED-ITEMS LAW), so
 * hiding them here would make the control lie about how many are hidden.
 */
export async function fetchRecordsForConversation(
  conversationId: string,
): Promise<RecordResult<KindRecord[]>> {
  try {
    const homed = await supabase
      .schema("content_ir")
      .from("kind_instance")
      .select(INSTANCE_COLUMNS)
      .eq("metadata->home->>conversation_id", conversationId)
      .is("deleted_at", null);
    if (homed.error) {
      return fail(`fetchRecordsForConversation(${conversationId})`, homed.error);
    }

    // The conversation's messages, COMPLETE — a partial list would silently
    // drop records produced by an early turn of a long chat.
    const messages = await readAllRows<{ id: string }>(
      ({ from, to }) =>
        supabase
          .schema("chat")
          .from("message")
          .select("id", { count: "exact" })
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "chat.message (conversation records)" },
    );

    const rowsById = new Map<string, RawInstanceRow>();
    for (const row of (homed.data ?? []) as RawInstanceRow[]) {
      rowsById.set(row.id, row);
    }

    if (messages.length > 0) {
      const edges = await readAllRows<{ target_id: string }>(
        ({ from, to }) =>
          supabase
            .schema("platform")
            .from("associations")
            .select("target_id", { count: "exact" })
            .eq("source_type", MESSAGE_SOURCE_TYPE)
            .in(
              "source_id",
              messages.map((m) => m.id),
            )
            .eq("target_type", KIND_INSTANCE_TARGET_TYPE)
            .eq("label", PRODUCED_BY_LABEL)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
            .range(from, to),
        { label: "platform.associations (produced_by)" },
      );
      const missing = edges
        .map((e) => e.target_id)
        .filter((id) => id && !rowsById.has(id));
      if (missing.length > 0) {
        const { data, error } = await supabase
          .schema("content_ir")
          .from("kind_instance")
          .select(INSTANCE_COLUMNS)
          .in("id", missing)
          .is("deleted_at", null);
        if (error) {
          return fail(`fetchRecordsForConversation(${conversationId})`, error);
        }
        for (const row of (data ?? []) as RawInstanceRow[]) {
          rowsById.set(row.id, row);
        }
      }
    }

    const rows = [...rowsById.values()];
    if (rows.length === 0) return { ok: true, value: [] };

    const slugs = await resolveKindSlugs([
      ...new Set(rows.map((r) => r.kind_definition_id)),
    ]);
    if (!slugs.ok) return slugs;

    const records = rows
      .map((row) => ({
        id: row.id,
        title: row.title,
        kind: slugs.value.get(row.kind_definition_id) ?? "",
        confirmation: normalizeConfirmation(row.confirmation),
        archivedAt: row.archived_at,
        createdAt: row.created_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ok: true, value: records };
  } catch (error) {
    return fail(`fetchRecordsForConversation(${conversationId})`, error);
  }
}

/** definition id → slug, for a mixed-kind list. */
async function resolveKindSlugs(
  ids: string[],
): Promise<RecordResult<Map<string, string>>> {
  try {
    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("id,kind")
      .in("id", ids);
    if (error) return fail("resolveKindSlugs", error);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      map.set(row.id, row.kind);
      definitionIdBySlug.set(row.kind, row.id);
    }
    return { ok: true, value: map };
  } catch (error) {
    return fail("resolveKindSlugs", error);
  }
}

// ---------------------------------------------------------------------------
// The transition doors
// ---------------------------------------------------------------------------

/** Confirm records. Editor+ — the RPC is the authorization, never the UI. */
export async function confirmKindRecords(
  ids: string[],
): Promise<RecordResult<{ id: string; confirmation: RecordConfirmation }[]>> {
  if (ids.length === 0) {
    return { ok: false, message: "Nothing to confirm." };
  }
  try {
    const { data, error } = await supabase
      .schema("content_ir")
      .rpc("confirm_kind_instances", { p_ids: ids });
    if (error) return fail("confirmKindRecords", error);
    // The kind is not knowable from an id list, so every listener re-reads.
    notifyKindRecordsChanged(null);
    return {
      ok: true,
      value: (data ?? []).map(
        (row: { id: string; confirmation: string | null }) => ({
          id: row.id,
          confirmation: normalizeConfirmation(row.confirmation),
        }),
      ),
    };
  } catch (error) {
    return fail("confirmKindRecords", error);
  }
}

/** Archive (or restore) records. Editor+ — same rule as confirm. */
export async function archiveKindRecords(
  ids: string[],
  archived: boolean,
): Promise<RecordResult<{ id: string; archivedAt: string | null }[]>> {
  if (ids.length === 0) {
    return { ok: false, message: "Nothing to archive." };
  }
  try {
    const { data, error } = await supabase
      .schema("content_ir")
      .rpc("archive_kind_instances", { p_ids: ids, p_archived: archived });
    if (error) return fail("archiveKindRecords", error);
    // Archiving moves a row out of the ACTIVE count every strip prints.
    notifyKindRecordsChanged(null);
    return {
      ok: true,
      value: (data ?? []).map((row: { id: string; archived_at: string | null }) => ({
        id: row.id,
        archivedAt: row.archived_at,
      })),
    };
  } catch (error) {
    return fail("archiveKindRecords", error);
  }
}

// ---------------------------------------------------------------------------
// THE REVERSE VIEW, GENERALISED: everything produced ABOUT an anchor entity
// ---------------------------------------------------------------------------

/**
 * The entity a set of records is attached to.
 *
 * A conversation is not special — it is simply the first anchor this reverse
 * view ever had. A web site, a plan node, a party: every one of them is
 * "a thing records were produced about", and the question a person asks in
 * front of it is the same question ("what did this produce?"). So the anchor
 * is a token + an id, and there is ONE reader (DD-131 slice 2, item 4).
 */
export interface RecordAnchor {
  /** The canonical entity token (`conversation`, `web_site`, …). */
  type: string;
  id: string;
}

/** The conversation anchor's token, named once so no caller spells it twice. */
export const CONVERSATION_ANCHOR_TYPE = "conversation";

/**
 * Every record produced about `anchor`, newest first, archived rows INCLUDED
 * and flagged (the caller filters — the archive control needs the true hidden
 * count to obey THE ARCHIVED-ITEMS LAW).
 *
 * Two readers behind one door, because a conversation genuinely answers the
 * question differently from every other anchor:
 *
 *  - `conversation` → the two-route union above (`metadata.home` + the
 *    `produced_by` edges of its messages). A chat's records are frequently
 *    homed without an edge and edged without a home.
 *  - anything else → the `content_ir_kind_instance → <anchor>` association
 *    edge, read through the registered associations chokepoint. This is the
 *    edge aidream's keyword-research pipeline already writes for a site
 *    (`metadata.reason = 'keyword_relationship_research'`), and the shape any
 *    future pipeline writes for any other anchor.
 *
 * No branch on WHICH site, WHICH kind, or WHICH pipeline exists anywhere here:
 * an anchor is an anchor.
 */
export async function fetchRecordsForAnchor(
  anchor: RecordAnchor,
): Promise<RecordResult<KindRecord[]>> {
  if (anchor.type === CONVERSATION_ANCHOR_TYPE) {
    return fetchRecordsForConversation(anchor.id);
  }
  try {
    const { associationsService } = await import(
      "@/features/scopes/service/associationsService"
    );
    const edges = await associationsService.listForTargets(anchor.type, [
      anchor.id,
    ]);
    if (!edges.ok) {
      // A failed READ is never an empty list. The panel says so in words.
      return {
        ok: false,
        message: `The records attached to this ${anchor.type.replace(/_/g, " ")} could not be read: ${edges.error.message}`,
      };
    }
    const ids = [
      ...new Set(
        edges.data.edges
          .filter((edge) => edge.sourceType === KIND_INSTANCE_TARGET_TYPE)
          .map((edge) => edge.sourceId)
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) return { ok: true, value: [] };

    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_instance")
      .select(INSTANCE_COLUMNS)
      .in("id", ids)
      .is("deleted_at", null);
    if (error) return fail(`fetchRecordsForAnchor(${anchor.type})`, error);

    const rows = (data ?? []) as RawInstanceRow[];
    if (rows.length === 0) return { ok: true, value: [] };

    const slugs = await resolveKindSlugs([
      ...new Set(rows.map((r) => r.kind_definition_id)),
    ]);
    if (!slugs.ok) return slugs;

    return {
      ok: true,
      value: rows
        .map((row) => ({
          id: row.id,
          title: row.title,
          kind: slugs.value.get(row.kind_definition_id) ?? "",
          confirmation: normalizeConfirmation(row.confirmation),
          archivedAt: row.archived_at,
          createdAt: row.created_at,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  } catch (error) {
    return fail(`fetchRecordsForAnchor(${anchor.type})`, error);
  }
}
