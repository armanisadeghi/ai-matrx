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

import type { RootState } from "@/lib/redux/store";
import type {
  ContextReceiptMismatch,
  ContextRowOrigin,
  ResolvedContextRow,
  SavedContextRule,
} from "@ai-matrx/agents/context";
import type {
  ContextReceiptData,
  ContextReceiptRow,
} from "@/types/python-generated/stream-events";
import type { Json } from "@/types/database.types";
import { contextEntryLabel } from "@/features/agents/components/context-policies-display/contextEntryLabel";
import {
  sentWithRequest,
  type ModelContext,
  type ModelContextDelivery,
} from "./messages.slice";

const DEFAULT_SURFACE_KEY = "_default";

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
  (state: RootState): ContextReceiptData | undefined => {
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
  (state: RootState): MessageContextReceiptSource | undefined => {
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
  (state: RootState): ContextReceiptMismatch[] | undefined => {
    const record = state.messages.byConversationId[conversationId]?.byId[messageId];
    if (!record) return undefined;
    const live = state.instanceContext?.receiptByConversationId[conversationId];
    if (!live || !sentWithRequest(record, live.requestId)) return undefined;
    return live.mismatches && live.mismatches.length > 0 ? live.mismatches : undefined;
  };

function cleanUserRule(rule: ContextReceiptRow["user_rule"]): SavedContextRule | null {
  if (!rule) return null;
  const out: SavedContextRule = {};
  if (typeof rule.include === "boolean") out.include = rule.include;
  if (
    typeof rule.max_inline_chars === "number" &&
    Number.isInteger(rule.max_inline_chars) &&
    rule.max_inline_chars >= 0
  ) {
    out.max_inline_chars = rule.max_inline_chars;
  }
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * One receipt row → the row a read-only `ContextRulesTable` renders. Same
 * shape as `receiptRowToResolved` in `@ai-matrx/agents/context` (aidream
 * apps/shared/matrx-agents, not yet in the published build) — swap to the
 * package export once it ships.
 *
 * Two additions: a label that is just the key (the server's `origin: "rule"`
 * rows, 2026-09-30) is named in words the way every other surface names it;
 * and `layers.default_max` is set to the limit the server APPLIED,
 * so the table's muted "inherited" limit shows the server's number instead of
 * re-deriving 200 from no layers (the receipt carries the result, not the
 * layers that produced it).
 */
export function receiptRowToResolved(row: ContextReceiptRow): ResolvedContextRow {
  const origin: ContextRowOrigin =
    row.surface_key !== DEFAULT_SURFACE_KEY
      ? "page"
      : row.origin === "client"
        ? "attached"
        : "system";
  return {
    key: row.key,
    label: contextEntryLabel({ key: row.key, label: row.label }),
    surfaceKey: row.surface_key,
    origin,
    value: undefined,
    chars: row.chars ?? null,
    userRule: cleanUserRule(row.user_rule),
    include: row.include,
    max_inline_chars: row.max_inline_chars,
    delivery: row.delivery,
    decided_by: {
      include: row.decided_by.include,
      max_inline_chars: row.decided_by.max_inline_chars,
    },
    clamped: row.clamped ?? false,
    layers: { default_max: row.max_inline_chars },
  };
}
