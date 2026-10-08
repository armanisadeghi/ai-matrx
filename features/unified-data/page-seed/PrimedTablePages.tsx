"use client";

// features/unified-data/page-seed/PrimedTablePages.tsx — lane PAGE-BUNDLE-2
//
// The /data/<table> and /data/<table>/r/<record> mounts, handed the server's first reads
// (`tablePageSeed.server.ts`) and priming them into the page's own stores during the FIRST render —
// before any of the page's effects ask. The screens themselves are unchanged.

import { use, useEffect, useRef, type ReactNode } from "react";
import { RecordsSeedProvider } from "@ai-matrx/records/react";

import { holdPrimaryContent } from "@/lib/boot/primaryContent";

import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";
import { UnifiedRecordPage } from "@/features/unified-data/table-page/UnifiedRecordPage";
import { primeTablePage } from "./primeTablePage";
import { TablePageSeedContext } from "./tablePageSeedContext";
import type { ServerRowsGate, TablePageSeed } from "./tablePageSeed.server";

function Primed({
  tableId,
  seed,
  gate,
  children,
}: {
  tableId: string;
  seed: Promise<TablePageSeed | null>;
  /** The person's knob `data/server_rows` (`readTablePage`): off draws the page as before SSR-ROWS. */
  gate: Promise<ServerRowsGate>;
  children: ReactNode;
}) {
  const dataSource = useRecordsDataSource();
  const primed = useRef<Promise<TablePageSeed | null> | null>(null);
  if (primed.current !== seed) {
    primed.current = seed;
    primeTablePage(tableId, seed, dataSource);
  }
  /*
   * THE ROWS IN THE SERVER'S HTML (lanes SSR-ROWS, SSR-ROWS-3). The page waits for the server's first
   * reads — never past the cap (`DEFAULT_CAP_MS` / `data/server_rows_cap_ms`, counted from the request's
   * start; past it both promises resolve off / null) — and draws from them in this pass: on the server,
   * so the HTML holds the table's rows, and while hydrating, so the browser draws the same rows and asks
   * nothing again. A null seed draws exactly what it drew before and the browser asks at once.
   */
  if (!use(gate).on) return <>{children}</>;
  const resolved = use(seed);
  const mine = resolved && resolved.tableId === tableId ? resolved : null;
  return (
    <TablePageSeedContext value={mine}>
      <RecordsSeedProvider seed={mine?.records ?? null}>{children}</RecordsSeedProvider>
    </TablePageSeedContext>
  );
}

/**
 * THE ROWS BEFORE THE SHELL'S BACKGROUND READS (`lib/boot/primaryContent`): held from the first
 * render until the grid's first cells are in the document (or the hold's cap), so the scope tree and
 * file tree start after the rows instead of competing with them.
 */
function useHoldShellUntilRows(tableId: string): void {
  const release = useRef<(() => void) | null>(null);
  if (release.current === null && typeof window !== "undefined") {
    release.current = holdPrimaryContent(`table-rows:${tableId}`);
  }
  useEffect(() => {
    const done = release.current ?? (() => {});
    if (document.querySelector("[data-matrx-cell-row]")) {
      done();
      return;
    }
    const watcher = new MutationObserver(() => {
      if (document.querySelector("[data-matrx-cell-row]")) {
        watcher.disconnect();
        done();
      }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    return () => {
      watcher.disconnect();
      done();
    };
  }, []);
}

export function PrimedTablePage({
  tableId,
  seed,
  gate,
}: {
  tableId: string;
  seed: Promise<TablePageSeed | null>;
  gate: Promise<ServerRowsGate>;
}) {
  useHoldShellUntilRows(tableId);
  return (
    <Primed tableId={tableId} seed={seed} gate={gate}>
      <UnifiedDataTablePage tableId={tableId} />
    </Primed>
  );
}

export function PrimedRecordPage({
  tableId,
  recordId,
  seed,
  gate,
}: {
  tableId: string;
  recordId: string;
  seed: Promise<TablePageSeed | null>;
  gate: Promise<ServerRowsGate>;
}) {
  return (
    <Primed tableId={tableId} seed={seed} gate={gate}>
      <UnifiedRecordPage tableId={tableId} recordId={recordId} />
    </Primed>
  );
}
