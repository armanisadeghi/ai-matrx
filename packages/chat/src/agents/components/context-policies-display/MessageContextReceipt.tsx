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
import { ContextRulesTable } from "@ai-matrx/agents/context/react";
import type { ContextReceiptMismatch } from "@ai-matrx/agents/context";
import type { ContextReceiptData } from "@/types/python-generated/stream-events";
import { receiptRowToResolved } from "@/features/agents/redux/execution-system/messages/message-context-receipt";
import { ContextPolicyTile } from "./ContextPolicyTile";

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
}: {
  receipt: ContextReceiptData;
  mismatches?: readonly ContextReceiptMismatch[];
}) {
  const rows = useMemo(() => (receipt.rows ?? []).map(receiptRowToResolved), [receipt]);
  return (
    <div className="flex min-w-0 flex-col">
      {receipt.model_reads_context === false ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          This model can&apos;t read context
        </p>
      ) : null}
      {receipt.rules_error ? (
        <p className="px-2 py-1 text-xs text-warning">Your context rules could not be read</p>
      ) : null}
      <ContextRulesTable
        rows={rows}
        cap={receipt.cap}
        readOnly
        mismatches={mismatches}
        onChange={NO_CHANGE}
      />
    </div>
  );
}

export function MessageContextReceipt({
  receipt,
  mismatches,
  className,
}: {
  receipt: ContextReceiptData;
  mismatches?: readonly ContextReceiptMismatch[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasMismatch = (mismatches?.length ?? 0) > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ContextPolicyTile
          typeLabel="Context"
          title={receiptSummary(receipt)}
          tooltip={hasMismatch ? "Sent differently than shown" : undefined}
          icon={hasMismatch ? TriangleAlert : Boxes}
          themeKey="context-group"
          aria-label={`Context: ${receiptSummary(receipt)}`}
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
          <MessageContextReceiptTable receipt={receipt} mismatches={mismatches} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
