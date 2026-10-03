"use client";

/**
 * MessageContextReceipt — what a SENT message's turn actually delivered.
 *
 * Rows come from the server's context receipt for that turn
 * (`selectMessageContextReceipt`: persisted `model_context.delivery.receipt`,
 * else the live receipt of the request this message was sent with) — never
 * from live context values and never from the client's belief. Read-only:
 * a sent turn cannot be changed; rules are edited in the composer. The pill
 * on the message toggles the turn's canvas tab (`message-context-receipt`,
 * keyed by the message id), whose body is `MessageContextReceiptView`.
 *
 * Contract: common-docs/systems/account/scopes-context/context-delivery/RULES.md §5.
 */

import { useMemo, useState } from "react";
import { Boxes, TriangleAlert } from "lucide-react";
import {
  ContextDeliveredValue,
  ContextReceiptBlockDetail,
  ContextReceiptBlocks,
  ContextRulesTable,
} from "@ai-matrx/agents/context/react";
import {
  unclaimedBlocks,
  type ContextReceiptMismatch,
  type ContextViewLoader,
} from "@ai-matrx/agents/context";
import type { ContextHierarchy } from "@ai-matrx/agents/context/react";
import { contextRowPlacer } from "../../redux/execution-system/context-rules/context-hierarchy";
import type { ContextReceiptData } from "@ai-matrx/agents/generated/stream-events";
import {
  receiptRowToResolved,
  selectMessageContextMismatches,
  selectMessageContextReceipt,
} from "../../redux/execution-system/messages/message-context-receipt";
import { ValueCountPill } from "./ValueCountPill";
import { loadContextView } from "../../redux/execution-system/context-rules/context-viewer";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { useChatCanvasTab } from "../../../host/canvas";
import { MESSAGE_CONTEXT_RECEIPT_KIND } from "../../../host/canvas-tabs";

/** The viewer door for a SENT turn (`GET /ai/context/delivered`), called only on open. */
export function useSentTurnContextView(conversationId: string, messageId: string): ContextViewLoader {
  const dispatch = useAppDispatch();
  return (target) => dispatch(loadContextView({ conversationId, messageId }, target));
}

const NO_CHANGE = () => {};

export function receiptSummary(receipt: ContextReceiptData): string {
  const rows = receipt.rows ?? [];
  const sent = rows.filter((r) => r.delivery !== "off").length;
  const off = rows.length - sent;
  return off > 0 ? `${sent} sent · ${off} off` : `${sent} sent`;
}

/**
 * The receipt TAB's title: what it is plus how many values rode the turn —
 * "Sent values · 5". The pill's own text ("5 sent · 1 off") read as
 * "Sent · 5 sent · 1 off" in a tab strip: the word twice, and nothing saying
 * what was sent (2026-10-03).
 */
export function receiptTabTitle(receipt: ContextReceiptData): string {
  const sent = (receipt.rows ?? []).filter((r) => r.delivery !== "off").length;
  return `Sent values · ${sent}`;
}

export function MessageContextReceiptTable({
  receipt,
  mismatches,
  load,
}: {
  receipt: ContextReceiptData;
  mismatches?: readonly ContextReceiptMismatch[];
  /** The viewer door for this turn (RULES.md §5b); without one, sizes show and text reads "—". */
  load?: ContextViewLoader;
}) {
  const blocks = receipt.blocks ?? [];
  // Each row carries what the model read for it, the blocks it rode with included.
  const rows = useMemo(
    () => (receipt.rows ?? []).map((row) => receiptRowToResolved(row, receipt.blocks)),
    [receipt],
  );
  // The same levels and groups the composer showed, from the page this turn named.
  const hierarchy = useMemo<ContextHierarchy>(
    () => ({ place: contextRowPlacer(receipt.surface ?? null) }),
    [receipt.surface],
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  // A block the model read as part of a value shows under that value, not twice.
  const alsoSent = unclaimedBlocks(
    blocks,
    rows.filter((r) => r.delivered).map((r) => r.key),
  );
  const opened = rows.find((r) => r.key === openKey) ?? null;
  const hasText = Boolean(
    opened && (opened.delivered || opened.onRequest || opened.deliveredBlocks?.length),
  );
  const block = alsoSent.find((b) => b.id === openBlock) ?? null;
  return (
    <div className="flex min-w-0 flex-col">
      {receipt.model_reads_context === false ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          This model can&apos;t read these values
        </p>
      ) : null}
      {receipt.rules_error ? (
        <p className="px-2 py-1 text-xs text-warning">Your rules could not be read</p>
      ) : null}
      <ContextRulesTable
        rows={rows}
        cap={receipt.cap}
        readOnly
        hierarchy={hierarchy}
        mismatches={mismatches}
        onChange={NO_CHANGE}
        onOpenRow={(key) => {
          setOpenBlock(null);
          setOpenKey((current) => (current === key ? null : key));
        }}
        selectedKey={openKey}
      />
      {opened && hasText ? (
        <ContextDeliveredValue row={opened} load={load} className="px-2 py-2" />
      ) : null}
      {alsoSent.length > 0 ? (
        <ContextReceiptBlocks
          blocks={alsoSent}
          selectedId={openBlock}
          onOpenBlock={(id) => {
            setOpenKey(null);
            setOpenBlock((current) => (current === id ? null : id));
          }}
        />
      ) : null}
      {block ? <ContextReceiptBlockDetail block={block} load={load} className="px-2 py-2" /> : null}
      {receipt.room_view ? <RoomViewManifestTable roomView={receipt.room_view} /> : null}
    </div>
  );
}

type RoomView = NonNullable<ContextReceiptData["room_view"]>;

/** The receipt's Group chat block id (aidream `group_chat.models.ROOM_VIEW_SLOT`). */
export const ROOM_VIEW_BLOCK_ID = "room_view";

/** The server's withheld rule (`sees`, `reveal.after_round`, `budget`…) as a short label. */
export function withheldRuleLabel(rule: string): string {
  if (rule === "sees") return "Not in sees";
  if (rule === "reveal.after_round") return "Before reveal round";
  if (rule === "reveal.every_rounds") return "Off-reveal round";
  if (rule === "budget") return "Over budget";
  return rule;
}

/**
 * A Group Chat turn's manifest (the receipt's `room_view`): the round and policy version it was
 * built at, how many messages were shown verbatim / digested, and every withheld message with
 * its speaker and the rule that withheld it. `speakerName` maps a participant key to its label;
 * `withheldText` (message id → words) adds what each withheld message said, when the host read it.
 */
export function RoomViewManifestTable({
  roomView,
  speakerName = (key) => key,
  withheldText,
}: {
  roomView: RoomView;
  speakerName?: (key: string) => string;
  withheldText?: Readonly<Record<string, string>>;
}) {
  const withheld = roomView.withheld ?? [];
  return (
    <div className="flex min-w-0 flex-col text-xs" data-room-view={roomView.participant_key}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1 tabular-nums text-muted-foreground">
        <span>Round {roomView.round}</span>
        <span>Policy v{roomView.policy_version}</span>
        <span>{(roomView.included ?? []).length} shown</span>
        <span>{(roomView.digested ?? []).length} digested</span>
        <span className={withheld.length ? "text-foreground" : undefined}>{withheld.length} withheld</span>
      </div>
      {roomView.error ? <p className="px-2 py-1 text-destructive">{roomView.error}</p> : null}
      {withheld.length > 0 ? (
        <table className="w-full table-fixed border-t border-border">
          <tbody>
            {withheld.map((item) => (
              <tr key={`${item.message_id}:${item.rule}`} className="border-b border-border/60 align-top" data-withheld={item.message_id}>
                <td className="w-28 truncate px-2 py-1 font-medium text-foreground">{speakerName(item.speaker)}</td>
                <td className="w-36 truncate px-2 py-1 text-muted-foreground">{withheldRuleLabel(item.rule)}</td>
                <td className="truncate px-2 py-1 text-muted-foreground" title={withheldText?.[item.message_id]}>
                  {withheldText?.[item.message_id] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * What a Group Chat participant was shown on one sent turn: the receipt's "Group chat" block —
 * the exact text, on demand, through the turn's viewer door — over its manifest.
 */
export function RoomViewReceipt({
  conversationId,
  messageId,
  receipt,
  speakerName,
  withheldText,
}: {
  conversationId: string;
  messageId: string;
  receipt: ContextReceiptData;
  speakerName?: (key: string) => string;
  withheldText?: Readonly<Record<string, string>>;
}) {
  const load = useSentTurnContextView(conversationId, messageId);
  const block = (receipt.blocks ?? []).find((b) => b.id === ROOM_VIEW_BLOCK_ID) ?? null;
  return (
    <div className="flex min-w-0 flex-col">
      {block ? <ContextReceiptBlockDetail block={block} load={load} className="px-2 py-2" /> : null}
      {receipt.room_view ? (
        <RoomViewManifestTable roomView={receipt.room_view} speakerName={speakerName} withheldText={withheldText} />
      ) : (
        <p className="px-2 py-1 text-xs text-muted-foreground">No group view on this turn</p>
      )}
    </div>
  );
}

/**
 * A sent turn's receipt in full — the body of its `message-context-receipt`
 * canvas tab. Reads the receipt and its mismatches for the message itself, so
 * the tab needs only the two ids.
 */
export function MessageContextReceiptView({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const receipt = useAppSelector(
    useMemo(() => selectMessageContextReceipt(conversationId, messageId), [conversationId, messageId]),
  );
  const mismatches = useAppSelector(
    useMemo(() => selectMessageContextMismatches(conversationId, messageId), [conversationId, messageId]),
  );
  const load = useSentTurnContextView(conversationId, messageId);
  if (!receipt) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No receipt for this turn</p>;
  }
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <MessageContextReceiptTable receipt={receipt} mismatches={mismatches} load={load} />
    </div>
  );
}

/**
 * The receipt's pill on a sent message: toggles that message's receipt tab in
 * the host canvas (absent → open · behind → focus · in front → close) and is
 * pressed while it is in front.
 */
export function MessageContextReceipt({
  conversationId,
  messageId,
  receipt,
  mismatches,
  className,
}: {
  conversationId: string;
  messageId: string;
  receipt: ContextReceiptData;
  mismatches?: readonly ContextReceiptMismatch[];
  className?: string;
}) {
  const tab = useChatCanvasTab({ kind: MESSAGE_CONTEXT_RECEIPT_KIND, key: messageId });
  const hasMismatch = (mismatches?.length ?? 0) > 0;
  const summary = receiptSummary(receipt);
  return (
    <ValueCountPill
      text={summary}
      title={hasMismatch ? "Sent differently than shown" : undefined}
      icon={hasMismatch ? TriangleAlert : Boxes}
      warn={hasMismatch}
      aria-label={summary}
      aria-pressed={tab.isVisible}
      onClick={() => tab.toggle({ title: receiptTabTitle(receipt), data: { conversationId, messageId } })}
      className={className}
    />
  );
}
