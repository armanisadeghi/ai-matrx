/**
 * The context a SENT message carried — read from the server's receipt, never
 * from live values (common-docs context-delivery RULES.md §5).
 *
 * One door, three sources, strict priority:
 *   1. `modelContext.delivery.receipt` — persisted on the user row; the truth
 *      on reload and for every old message.
 *   2. `_liveContextReceipt` — the receipt streamed for the request this
 *      message was sent with (stored on the message by the messages slice's
 *      `setContextReceipt` case), before the persisted row is re-read.
 *   3. `instanceContext.receiptByConversationId[cid]` — only when that entry's
 *      `requestId` is the one THIS message was sent with (a server-reserved
 *      user row whose receipt landed before the row existed).
 * A message loaded from the database carries no request link, so it can never
 * show another turn's receipt; without a persisted receipt it has none.
 */

import type { ChatRootState } from "../../../../store/root-state";
import {
  receiptRowToResolved as packageReceiptRowToResolved,
  type ContextReceiptMismatch,
  type ResolvedContextRow,
} from "@ai-matrx/agents/context";
import type {
  ContextReceiptData,
  ContextReceiptRow,
} from "@ai-matrx/agents/generated/stream-events";
import type { Json } from "../../../../host/db-types";
import { contextEntryLabel } from "../../../components/context-policies-display/contextEntryLabel";
import { toContextReceiptRow } from "../context-rules/receipt-check";
import {
  sentWithRequest,
  type ModelContext,
  type ModelContextDelivery,
} from "./messages.slice";

export type MessageContextReceiptSource = "persisted" | "live";

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** A receipt the table can render: a cap and a rows array. */
export function isContextReceiptData(v: unknown): v is ContextReceiptData {
  return isObject(v) && typeof v.cap === "number" && Array.isArray(v.rows);
}

/**
 * `cx_message.model_context` → `ModelContext`, keeping the delivery ledger and
 * its receipt. A malformed receipt is dropped (the bubble falls back to the
 * snapshot) rather than rendered as an empty "Nothing in context".
 */
export function modelContextFromRow(raw: Json | null | undefined): ModelContext | null {
  if (!isObject(raw)) return null;
  const mc = raw as unknown as ModelContext;
  const rawDelivery: unknown = (raw as Record<string, unknown>).delivery;
  if (!isObject(rawDelivery)) {
    const { delivery: _drop, ...rest } = mc;
    return rest;
  }
  const delivery: ModelContextDelivery = { ...(rawDelivery as ModelContextDelivery) };
  if (!isContextReceiptData(rawDelivery.receipt)) delete delivery.receipt;
  return { ...mc, delivery };
}

/** The receipt this message's turn produced, by the priority above. */
export const selectMessageContextReceipt =
  (conversationId: string, messageId: string) =>
  (state: ChatRootState): ContextReceiptData | undefined => {
    const record = state.messages.byConversationId[conversationId]?.byId[messageId];
    if (!record || record.role !== "user") return undefined;
    const persisted = record.modelContext?.delivery?.receipt;
    if (persisted) return persisted;
    if (record._liveContextReceipt) return record._liveContextReceipt;
    const live = state.instanceContext?.receiptByConversationId[conversationId];
    if (live && sentWithRequest(record, live.requestId)) return live.receipt;
    return undefined;
  };

/** Where the receipt came from — `undefined` when the message has none. */
export const selectMessageContextReceiptSource =
  (conversationId: string, messageId: string) =>
  (state: ChatRootState): MessageContextReceiptSource | undefined => {
    const record = state.messages.byConversationId[conversationId]?.byId[messageId];
    if (!record || record.role !== "user") return undefined;
    if (record.modelContext?.delivery?.receipt) return "persisted";
    if (record._liveContextReceipt) return "live";
    const live = state.instanceContext?.receiptByConversationId[conversationId];
    if (live && sentWithRequest(record, live.requestId)) return "live";
    return undefined;
  };

/**
 * The expected-vs-actual mismatches for this message's turn — only while the
 * conversation's latest check is this message's request (they are computed
 * live and never persisted).
 */
export const selectMessageContextMismatches =
  (conversationId: string, messageId: string) =>
  (state: ChatRootState): ContextReceiptMismatch[] | undefined => {
    const record = state.messages.byConversationId[conversationId]?.byId[messageId];
    if (!record) return undefined;
    const live = state.instanceContext?.receiptByConversationId[conversationId];
    if (!live || !sentWithRequest(record, live.requestId)) return undefined;
    return live.mismatches && live.mismatches.length > 0 ? live.mismatches : undefined;
  };

/**
 * One receipt row → the row a read-only `ContextRulesTable` renders — the
 * package's `receiptRowToResolved` (`@ai-matrx/agents/context`, which rebuilds
 * the deciding layer from what the server applied), plus one thing for history:
 * receipts persisted before 2026-10-01 named `origin: "rule"` rows by their raw
 * key; those are named in words, the way every other surface names them.
 */
export function receiptRowToResolved(
  row: ContextReceiptRow,
  blocks?: ContextReceiptData["blocks"],
): ResolvedContextRow {
  const base = packageReceiptRowToResolved(toContextReceiptRow(row), blocks);
  return {
    ...base,
    label: contextEntryLabel({ key: row.key, label: row.label }),
  };
}
