"use client";

// features/unified-data/page-seed/PrimedTablePages.tsx — lane PAGE-BUNDLE-2
//
// The /data/<table> and /data/<table>/r/<record> mounts, handed the server's first reads
// (`tablePageSeed.server.ts`) and priming them into the page's own stores during the FIRST render —
// before any of the page's effects ask. The screens themselves are unchanged.

import { useEffect, useRef, type ReactNode } from "react";

import { holdPrimaryContent } from "@/lib/boot/primaryContent";

import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";
import { UnifiedRecordPage } from "@/features/unified-data/table-page/UnifiedRecordPage";
import { primeTablePage } from "./primeTablePage";
import type { TablePageSeed } from "./tablePageSeed.server";

function Primed({
  tableId,
  seed,
  children,
}: {
  tableId: string;
  seed: Promise<TablePageSeed | null>;
  children: ReactNode;
}) {
  const dataSource = useRecordsDataSource();
  const primed = useRef<Promise<TablePageSeed | null> | null>(null);
  if (primed.current !== seed) {
    primed.current = seed;
    primeTablePage(tableId, seed, dataSource);
  }
  return <>{children}</>;
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

export function PrimedTablePage({ tableId, seed }: { tableId: string; seed: Promise<TablePageSeed | null> }) {
  useHoldShellUntilRows(tableId);
  return (
    <Primed tableId={tableId} seed={seed}>
      <UnifiedDataTablePage tableId={tableId} />
    </Primed>
  );
}

export function PrimedRecordPage({
  tableId,
  recordId,
  seed,
}: {
  tableId: string;
  recordId: string;
  seed: Promise<TablePageSeed | null>;
}) {
  return (
    <Primed tableId={tableId} seed={seed}>
      <UnifiedRecordPage tableId={tableId} recordId={recordId} />
    </Primed>
  );
}
