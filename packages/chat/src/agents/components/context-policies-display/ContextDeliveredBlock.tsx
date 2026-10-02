"use client";

/**
 * What the model READ for one context value — the receipt's `delivered` (the
 * value's own element in the rendered context block) and, for an on-request
 * value, `on_request` (what the `context` tool returns). Verbatim from the
 * server; never the client's pre-send copy. RULES.md §5.
 *
 * The package renders the same in its panel detail from @ai-matrx/agents
 * 0.27.0 (`ContextDeliveredValue`); this host copy serves the sent-message
 * view and older installed package builds.
 */

import { cn } from "@ai-matrx/design-system";
import type { ContextDeliveredText } from "@host/types/python-generated/stream-events";
import type { ContextDeliveredFields } from "../../redux/execution-system/context-rules/receipt-check";

export function ContextDeliveredBlock({
  fields,
  className,
}: {
  fields: ContextDeliveredFields;
  className?: string;
}) {
  if (!fields.delivered && !fields.onRequest && !fields.serverRendered) return null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {fields.delivered ? <DeliveredText title="Agent received" text={fields.delivered} /> : null}
      {fields.onRequest ? (
        <DeliveredText title="Returned on request" text={fields.onRequest} />
      ) : null}
      {fields.serverRendered ? (
        <DeliveredText title="Agent also received" text={fields.serverRendered} />
      ) : null}
    </div>
  );
}

function DeliveredText({ title, text }: { title: string; text: ContextDeliveredText }) {
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">{title}</span>
        {text.truncated ? (
          <span className="tabular-nums text-muted-foreground">
            {`First ${text.text.length.toLocaleString()} of ${text.chars.toLocaleString()} chars`}
          </span>
        ) : null}
      </div>
      <pre
        data-testid="context-delivered-text"
        className={cn(
          "max-h-[min(50dvh,22rem)] cursor-text select-text overflow-auto",
          "whitespace-pre-wrap break-words rounded border border-border",
          "bg-muted/40 p-2 font-mono text-[11px] text-foreground",
        )}
      >
        {text.text}
      </pre>
    </section>
  );
}
