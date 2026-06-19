"use client";

/**
 * Generic drawer body — the graceful default for types without a custom UI yet
 * (table / list / project / agent / transcript / workbook / document, plus any
 * unregistered type). Fills the full height: free text when present, otherwise
 * a pretty-printed payload — NEVER a tiny collapsed dump pushed to the top.
 *
 * Reference id counts live in `GenericFooter`. Adding a custom UI = register a
 * dedicated `Body` in `registry.tsx`; this file should shrink over time.
 */

import type { ContextItemBodyProps } from "../types";

function countRefs(item: ContextItemBodyProps["item"]): [string, number][] {
  const r = item.refs;
  return (
    [
      ["projects", r.projectIds?.length ?? 0],
      ["agents", r.agentIds?.length ?? 0],
      ["transcripts", r.transcriptIds?.length ?? 0],
      ["workbooks", r.workbookIds?.length ?? 0],
      ["documents", r.documentIds?.length ?? 0],
    ] as [string, number][]
  ).filter(([, n]) => n > 0);
}

export function GenericBody({ item }: ContextItemBodyProps) {
  const text = item.refs.text;

  if (text) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {text}
        </p>
      </div>
    );
  }

  return (
    <pre className="h-full min-h-0 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[11px] leading-relaxed text-foreground/80">
      {JSON.stringify(item.raw, null, 2)}
    </pre>
  );
}

export function GenericFooter({ item }: ContextItemBodyProps) {
  const counts = countRefs(item);
  if (counts.length === 0) {
    return (
      <span className="text-[11px] italic text-muted-foreground">
        No dedicated preview yet
      </span>
    );
  }
  return (
    <span className="truncate text-[11px] text-muted-foreground">
      {counts.map(([label, n]) => `${n} ${label}`).join(" · ")}
    </span>
  );
}
