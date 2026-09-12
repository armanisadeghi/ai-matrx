/**
 * THE ONE CLIENT STORE for a kind record (DD-131 slice 1).
 *
 * Every client save path that turns something a person is LOOKING AT into a
 * `content_ir.kind_instance` row goes through `storeKindRecord`:
 *
 *   - the chat block's record chrome ("Save this Wine Tasting"),
 *   - the message action "Save to my Shapes",
 *   - the Shape Studio's Test tab.
 *
 * ## Why this module exists
 *
 * Until 2026-09-12 the chrome's save wrote `metadata.home = { conversation_id,
 * message_id }` and NO association row, while aidream's server store wrote
 * `metadata.home = { conversation_id }`, `metadata.source = { message_id,
 * fingerprint, block_id }` AND a `platform.associations` `produced_by` edge.
 * The same fact — which message produced this record — was stored in two
 * different shapes, and the edge the design calls THE provenance link was
 * absent from every record a real user had ever created (V-42 §3.4). Two write
 * paths for one fact is the defect; this module is the one path, and it writes
 * the SERVER's shape, because that is the shape every reader was designed for.
 *
 * ## The shape, exactly
 *
 *   metadata.home   = { conversation_id }          // where the record lives
 *   metadata.source = { message_id, fingerprint, block_id }
 *   platform.associations: source_type 'message', source_id <chat.message.id>,
 *     target_type 'content_ir_kind_instance', target_id <row id>,
 *     label 'produced_by'
 *
 * A key we cannot honestly fill is OMITTED rather than invented: a save from
 * the Test tab has no conversation, so it carries no `home` and no edge, and a
 * block whose envelope carried no fingerprint writes no `fingerprint`. Nothing
 * here fabricates provenance it did not observe.
 *
 * ## The edge is written by the client, and that is verified
 *
 * `authenticated` holds INSERT on `platform.associations`, and the insert
 * policy (`assoc_insert`) admits a row whose `created_by` is the signed-in user
 * in an organization they belong to — checked live on 2026-09-12 against
 * `brsgrqvjdzwihsvnfqkf`. So no server door is needed for the edge.
 *
 * ## A failed edge NEVER fails the save, and never passes silently
 *
 * The row is the user's data; the edge is provenance about it. Losing the
 * record because its edge could not be written would be the worse outcome, so
 * the edge failure comes back on the result as a sentence for the caller to
 * show (THE NOTHING-FAILS-SILENTLY LAW) and is captured to the error store.
 */

import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { Json } from "@/types/database.types";
import { saveKindInstance, type SaveKindInstanceResult } from "./instance-service";
import { notifyKindRecordsChanged } from "@/features/content-ir/records/record-change-bus";

/** The association contract the server writes when a chat turn emits a kind. */
export const PRODUCED_BY_LABEL = "produced_by";
export const MESSAGE_SOURCE_TYPE = "message";
export const KIND_INSTANCE_TARGET_TYPE = "content_ir_kind_instance";

/** Where a record came from. Every field is optional because provenance is. */
export interface KindRecordProvenance {
  /** `chat.conversation.id` — becomes `metadata.home.conversation_id`. */
  conversationId?: string | null;
  /** `chat.message.id` — becomes `metadata.source.message_id` AND the edge. */
  messageId?: string | null;
  /** The block envelope's own fingerprint (`CanonicalBlockIR.fingerprint`). */
  fingerprint?: string | null;
  /** The host's block identity, when it has one. */
  blockId?: string | null;
}

export interface StoreKindRecordArgs {
  kindDefinitionId: string;
  /** The kind's version as the caller knows it; the save re-reads the live one. */
  kindVersion: number;
  value: Record<string, unknown>;
  organizationId: string | null;
  title?: string | null;
  titleKey?: string | null;
  provenance?: KindRecordProvenance;
}

export interface StoreKindRecordResult extends SaveKindInstanceResult {
  /** True when a `produced_by` edge was written for this row. */
  producedByEdge: boolean;
  /**
   * Present ONLY when the row was written but its provenance edge was not —
   * a sentence for the caller to show. Never a silent loss.
   */
  provenanceWarning: string | null;
}

/**
 * 🚨 A SAVE THAT CANNOT FINISH MUST SAY SO (V-45 §3.3, Law 4).
 *
 * Observed live: the DB/gateway intermittently returned 504s during a save,
 * and the button sat on "Saving…" for 11+ seconds with no error, no toast,
 * and no row written — a person would walk away believing it saved. Every
 * caller of `storeKindRecord` already has a catch block that shows a named
 * refusal (`ShapeTestTab.saveInstance`, `KindRecordChrome.onSave`,
 * `saveKindInstancesFromMessage`) — the one thing missing was ever REACHING
 * that catch when the network call itself never settles. `SAVE_TIMEOUT_MS` is
 * generous enough for a normal write under load and short enough that nobody
 * is left staring at a lie.
 */
export const SAVE_TIMEOUT_MS = 20_000;

function withSaveTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${what} did not finish within ${SAVE_TIMEOUT_MS / 1000} seconds — the database or network is not responding. Nothing was confirmed saved; check your connection and try again.`,
        ),
      );
    }, SAVE_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * The metadata a record born from a block carries — the server's shape.
 * Exported so a test can assert the two paths agree without a database.
 */
export function buildRecordMetadata(
  provenance: KindRecordProvenance | undefined,
): Record<string, unknown> | null {
  if (!provenance) return null;
  const metadata: Record<string, unknown> = {};
  if (provenance.conversationId) {
    metadata.home = { conversation_id: provenance.conversationId };
  }
  if (provenance.messageId) {
    const source: Record<string, unknown> = {
      message_id: provenance.messageId,
    };
    if (provenance.fingerprint) source.fingerprint = provenance.fingerprint;
    if (provenance.blockId) source.block_id = provenance.blockId;
    metadata.source = source;
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

/**
 * Write one record and its provenance. Throws on a failed ROW write (the
 * caller shows the sentence); an edge failure rides back on the result.
 */
export async function storeKindRecord(
  args: StoreKindRecordArgs,
): Promise<StoreKindRecordResult> {
  const metadata = buildRecordMetadata(args.provenance);
  const saved = await withSaveTimeout(
    saveKindInstance({
      kindDefinitionId: args.kindDefinitionId,
      kindVersion: args.kindVersion,
      value: args.value,
      organizationId: args.organizationId,
      title: args.title,
      titleKey: args.titleKey,
      metadata,
    }),
    "Saving the record",
  );

  const messageId = args.provenance?.messageId;
  const warning = messageId
    ? await withSaveTimeout(
        writeProducedByEdge({
          messageId,
          recordId: saved.id,
          organizationId: args.organizationId,
        }),
        "Linking the record back to its message",
      ).catch((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      )
    : null;

  // Announced LAST, with the row and its edge both settled, so a listener that
  // re-reads on this signal can never read a half-written provenance. Every
  // client store announces itself, so no OTHER screen keeps printing a count
  // this write just made false (THE RECORD CHANGE BUS).
  notifyKindRecordsChanged(null);

  return {
    ...saved,
    producedByEdge: Boolean(messageId) && warning === null,
    provenanceWarning: warning,
  };
}

/**
 * The `produced_by` edge, written exactly as the server writes it. Returns
 * null on success, or the sentence to show when the edge could not be written.
 */
async function writeProducedByEdge(args: {
  messageId: string;
  recordId: string;
  organizationId: string | null;
}): Promise<string | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    const { error } = await supabase
      .schema("platform")
      .from("associations")
      .insert({
        source_type: MESSAGE_SOURCE_TYPE,
        source_id: args.messageId,
        target_type: KIND_INSTANCE_TARGET_TYPE,
        target_id: args.recordId,
        label: PRODUCED_BY_LABEL,
        organization_id: args.organizationId,
        created_by: userId,
        metadata: {} as Json,
      });
    if (!error) return null;
    const message = `The record was saved, but the link back to the message it came from was not written: ${error.message}`;
    captureError({
      source: "content-ir",
      message: `[store-kind-record] produced_by edge refused for ${args.recordId}: ${error.message}`,
      callSite: "storeKindRecord",
      raw: error,
    });
    return message;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    captureError({
      source: "content-ir",
      message: `[store-kind-record] produced_by edge threw for ${args.recordId}: ${detail}`,
      callSite: "storeKindRecord",
      raw: error,
    });
    return `The record was saved, but the link back to the message it came from was not written: ${detail}`;
  }
}
