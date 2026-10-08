"use client";

// features/unified-data/page-seed/tablePageSeedContext.ts — lane SSR-ROWS
//
// The server's first reads for THIS page, already resolved, for the hooks that must draw from them in
// the first pass (on the server and while hydrating) — `useObjectOrganization` reads the table's
// organization from here before its kept store has any answer, so the table mounts in the server's
// HTML instead of its skeleton. A React context, never module state: on the server it is per request.

import { createContext, useContext } from "react";

import type { TablePageSeed } from "./tablePageSeed.server";

export const TablePageSeedContext = createContext<TablePageSeed | null>(null);

/** The resolved seed of the page being drawn, or null. */
export function useTablePageSeed(): TablePageSeed | null {
  return useContext(TablePageSeedContext);
}
