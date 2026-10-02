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
import * as contextReact from "@ai-matrx/agents/context/react";
import { Boxes, TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { ContextRulesTable } from "@ai-matrx/agents/context/react";
import type { ContextReceiptMismatch } from "@ai-matrx/agents/context";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import { receiptRowToResolved } from "../../redux/execution-system/messages/message-context-receipt";
import { ValueCountPill } from "./ValueCountPill";
import { ContextDeliveredBlock, DeliveredText } from "./ContextDeliveredBlock";
import { deliveredFieldsFor } from "../../redux/execution-system/context-rules/receipt-check";
import {
  loadContextView,
  type ContextViewLoader,
} from "../../redux/execution-system/context-rules/context-viewer";
import { useAppDispatch } from "../../../store/hooks";

/** The viewer door for a SENT turn (`GET /ai/context/delivered`), called only on open. */
export function useSentTurnContextView(conversationId: string, messageId: string): ContextViewLoader {
  const dispatch = useAppDispatch();
  return (target) => dispatch(loadContextView({ conversationId, messageId }, target));
}
import { formatChars } from "@ai-matrx/agents/context";

/** Blocks the model read as part of a value (the package's `CONTEXT_ROW_BLOCKS` ≥ 0.29.0). */
const ROW_BLOCKS: Readonly<Record<string, readonly string[]>> = {
  organization: ["organization_catalog"],
};

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
  const rows = useMemo(() => (receipt.rows ?? []).map(receiptRowToResolved), [receipt]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const blocks = receipt.blocks ?? [];
  // A block the model read as part of a value shows under that value, not twice.
  const claimed = new Set(
    rows.filter((r) => deliveredFieldsFor(receipt, r.key, r.surfaceKey).delivered).flatMap((r) => ROW_BLOCKS[r.key] ?? []),
  );
  const alsoSent = blocks.filter((b) => !claimed.has(b.id));
  // What the model read for the opened value (RULES.md §5 `delivered`) — sizes
  // here, the text fetched on open.
  const opened = useMemo(() => {
    const row = rows.find((r) => r.key === openKey);
    if (!row) return null;
    const fields = deliveredFieldsFor(receipt, row.key, row.surfaceKey);
    const attached = fields.delivered
      ? blocks.filter((b) => (ROW_BLOCKS[row.key] ?? []).includes(b.id))
      : [];
    return { key: row.key, fields, attached };
  }, [rows, openKey, receipt, blocks]);
  const block = alsoSent.find((b) => b.id === openBlock) ?? null;
  const BlockList = (contextReact as {
    ContextReceiptBlocks?: (props: {
      blocks: readonly typeof alsoSent[number][];
      selectedId?: string | null;
      onOpenBlock?: (id: string) => void;
    }) => React.ReactNode;
  }).ContextReceiptBlocks;
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
      {opened ? (
        <ContextDeliveredBlock
          rowKey={opened.key}
          delivered={opened.fields.delivered}
          onRequest={opened.fields.onRequest}
          blocks={opened.attached}
          load={load}
          className="px-2 py-2"
        />
      ) : null}
      {alsoSent.length > 0 ? (
        BlockList ? (
          <BlockList
            blocks={alsoSent}
            selectedId={openBlock}
            onOpenBlock={(id) => {
              setOpenKey(null);
              setOpenBlock((current) => (current === id ? null : id));
            }}
          />
        ) : (
          <div role="table" aria-label="Also sent" className="text-xs">
            <div className="flex h-6 items-center bg-muted/40 px-2 font-medium text-muted-foreground">
              Also sent
            </div>
            {alsoSent.map((b) => (
              <div key={b.id} role="row" className="flex h-7 items-center gap-2 border-b border-border/50 px-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => {
                    setOpenKey(null);
                    setOpenBlock((current) => (current === b.id ? null : b.id));
                  }}
                >
                  {b.label}
                </button>
                <span className="tabular-nums">{formatChars(b.delivered.chars)}</span>
              </div>
            ))}
          </div>
        )
      ) : null}
      {block ? (
        <div className="px-2 py-2">
          <DeliveredText
            title={block.label}
            target={{ kind: "block", key: block.id }}
            size={block.delivered}
            load={load}
          />
        </div>
      ) : null}
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
