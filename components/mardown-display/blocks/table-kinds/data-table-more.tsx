"use client";

/**
 * THE FETCH-MORE SEAM — LAW 3 (`common-docs/policies/no-dead-ends.md`, Arman
 * 2026-08-25):
 *
 * > "anything that hides data from a user is just trash… Imagine if you use
 * > Google search and Google shows you the first three results and then says,
 * > well, we have three hundred more, but we're not gonna show them to you.
 * > And there's no option to see more."
 *
 * > "**The cap belongs to the RENDERER, never to the fetch.** […] If a producer
 * > caps, the surface must be able to ask for more."
 *
 * A `data_table` that arrives `truncated` is missing rows the CLIENT DOES NOT
 * HAVE. No control inside the renderer can recover them — only whoever ran the
 * read can. So the renderer cannot fix this alone, and a truncation banner with
 * no control is exactly the dead end the law names.
 *
 * This is the seam that closes it. A host that KNOWS how to re-run its read
 * (a demo page, a SQL console, a tool-result panel) wraps its table in
 * `<DataTableMoreProvider onRequestMore={…}>`, and the banner grows a working
 * "Load the rest" button. It is a CONTEXT rather than a prop on purpose: the
 * canonical render path is the kind registry (`KindInstanceRender` →
 * `SafeBlockRenderer` → the block), which passes a value and nothing else — a
 * prop would only reach the tables nobody routes.
 *
 * A host that genuinely cannot fetch more provides nothing, and the banner says
 * so plainly instead of offering a button that lies.
 */

import React from "react";

export interface DataTableMoreRequest {
  /** Rows the reader can already see. */
  have: number;
  /** Rows the source says exist, when it said. */
  total: number | null;
}

export interface DataTableMoreContextValue {
  /**
   * Re-run the read for (at least) the whole table. Resolves when the new rows
   * have been handed to the renderer; rejects (or throws) to surface an error.
   */
  onRequestMore: (request: DataTableMoreRequest) => void | Promise<void>;
  /** True while a re-read is in flight — the button shows it. */
  pending?: boolean;
  /** Ceiling the HOST cannot exceed, in plain words. Shown, never hidden. */
  limitNote?: string | null;
}

const DataTableMoreContext =
  React.createContext<DataTableMoreContextValue | null>(null);

export function DataTableMoreProvider({
  value,
  children,
}: {
  value: DataTableMoreContextValue;
  children: React.ReactNode;
}) {
  return (
    <DataTableMoreContext.Provider value={value}>
      {children}
    </DataTableMoreContext.Provider>
  );
}

export function useDataTableMore(): DataTableMoreContextValue | null {
  return React.useContext(DataTableMoreContext);
}
