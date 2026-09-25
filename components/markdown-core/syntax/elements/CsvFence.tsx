"use client";

// ```csv / ```tsv inside any markdown — the same sortable table the chat
// engine's CSV block renders (CsvBlock), loaded on first use.

import { lazy, Suspense } from "react";

const CsvBlock = lazy(() => import("@/components/mardown-display/blocks/csv/CsvBlock"));

export function CsvFence(props: { "data-source"?: string; "data-delimiter"?: string }) {
  const source = String(props["data-source"] ?? "");
  const delimiter = props["data-delimiter"] === "tab" ? "\t" : ",";
  return (
    <Suspense
      fallback={
        <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{source}</pre>
      }
    >
      <CsvBlock content={source} delimiter={delimiter} className="my-3" />
    </Suspense>
  );
}
