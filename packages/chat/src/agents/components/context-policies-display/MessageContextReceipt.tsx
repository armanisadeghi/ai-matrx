"use client";

/**
 * MessageContextReceipt — what a SENT message's turn actually delivered.
 *
 * Rows come from the server's context receipt for that turn
 * (`selectMessageContextReceipt`: persisted `model_context.delivery.receipt`,
 * else the live receipt of the request this message was sent with) — never
 * from live context values and never from the client's belief. Read-only:
 * a sent turn cannot be changed; rules are edited in the composer.
 *
 * Contract: common-docs/systems/scopes-context/context-delivery/RULES.md §5.
 */

import { useMemo, useState } from "react";
import { Boxes, TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
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
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import { receiptRowToResolved } from "../../redux/execution-system/messages/message-context-receipt";
import { ValueCountPill } from "./ValueCountPill";
import { loadContextView } from "../../redux/execution-system/context-rules/context-viewer";
import { useAppDispatch } from "../../../store/hooks";

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
    </div>
  );
}

export function MessageContextReceipt({
  receipt,
  mismatches,
  load,
  className,
}: {
  receipt: ContextReceiptData;
  mismatches?: readonly ContextReceiptMismatch[];
  /** The viewer door for this sent turn (RULES.md §5b: `useSentTurnContextView`). */
  load?: ContextViewLoader;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasMismatch = (mismatches?.length ?? 0) > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ValueCountPill
          text={receiptSummary(receipt)}
          title={hasMismatch ? "Sent differently than shown" : undefined}
          icon={hasMismatch ? TriangleAlert : Boxes}
          warn={hasMismatch}
          aria-label={receiptSummary(receipt)}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        align="start"
        side="top"
        sideOffset={6}
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <div className="max-h-72 overflow-y-auto">
          <MessageContextReceiptTable receipt={receipt} mismatches={mismatches} load={load} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
