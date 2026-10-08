"use client";

// features/unified-data/page-seed/PrimedTablePages.tsx — lane PAGE-BUNDLE-2
//
// The /data/<table> and /data/<table>/r/<record> mounts, handed the server's first reads
// (`tablePageSeed.server.ts`) and priming them into the page's own stores during the FIRST render —
// before any of the page's effects ask. The screens themselves are unchanged.

import { Suspense, use, useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { RecordsSeedProvider } from "@ai-matrx/records/react";

import { holdPrimaryContent } from "@/lib/boot/primaryContent";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";
import { UnifiedRecordPage } from "@/features/unified-data/table-page/UnifiedRecordPage";
import { askClientTableSeed } from "./clientTableSeed";
import { primeTablePage } from "./primeTablePage";
import { RecordRouteSkeleton, TableRouteSkeleton } from "./TableRouteSkeleton";
import { TablePageSeedContext } from "./tablePageSeedContext";
import type { ServerRowsGate, TablePageSeed } from "./tablePageSeed.server";

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

/** A page drawn from a seed — the server's or the browser's own — primed once into the page's stores. */
const primedSeeds = new WeakSet<TablePageSeed>();
function Seeded({ tableId, seed, children }: { tableId: string; seed: TablePageSeed | null; children: ReactNode }) {
  const dataSource = useRecordsDataSource();
  if (seed && typeof window !== "undefined" && !primedSeeds.has(seed)) {
    primedSeeds.add(seed);
    primeTablePage(tableId, Promise.resolve(seed), dataSource);
  }
  return (
    <TablePageSeedContext value={seed}>
      <RecordsSeedProvider seed={seed?.records ?? null}>{children}</RecordsSeedProvider>
    </TablePageSeedContext>
  );
}

/**
 * THE RACE (lane SSR-ROWS-3). Two answers to the same question, the same shape, the same doors and
 * arguments: the server's seed (`seed`, only when the person's knob is on, streamed into this
 * boundary) and the browser's own (`own`, asked the moment the page hydrated). Whichever lands first
 * draws the page; the other is discarded:
 *  - the server's lands first → the page is drawn from it, in the server's HTML, and `settled`
 *    holds it there: the browser's answer arriving later changes nothing (no second draw, no flicker);
 *  - the browser's lands first → the page is drawn from it at once (a pending server boundary is
 *    client-rendered by the update), and the server's seed, arriving later, is ignored.
 * Until one lands the page shows the route's own skeleton, the same box `loading.tsx` drew.
 */
type OwnSeed = { key: string; seed: TablePageSeed | null };
const pageKey = (tableId: string, recordId: string | null) => (recordId ? `${tableId}/r/${recordId}` : tableId);

function RacedPage({
  tableId,
  recordId,
  gate,
  seed,
  own,
  settled,
  skeleton,
  children,
}: {
  tableId: string;
  recordId: string | null;
  gate: Promise<ServerRowsGate>;
  seed: Promise<TablePageSeed | null>;
  own: OwnSeed | null;
  settled: RefObject<string | null>;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  // Two components, so the one that waits on the server (`use`) is never the one the browser's
  // answer replaces it with.
  const key = pageKey(tableId, recordId);
  if (own && own.key === key && settled.current !== key) {
    return (
      <Seeded tableId={tableId} seed={own.seed}>
        {children}
      </Seeded>
    );
  }
  return (
    <ServerDrawn tableId={tableId} recordId={recordId} gate={gate} seed={seed} settled={settled} skeleton={skeleton}>
      {children}
    </ServerDrawn>
  );
}

function ServerDrawn({
  tableId,
  recordId,
  gate,
  seed,
  settled,
  skeleton,
  children,
}: {
  tableId: string;
  recordId: string | null;
  gate: Promise<ServerRowsGate>;
  seed: Promise<TablePageSeed | null>;
  settled: RefObject<string | null>;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const server = use(gate).on ? use(seed) : null;
  const mine =
    server && server.tableId === tableId && server.records && (recordId === null || server.recordId === recordId) ? server : null;
  if (mine) {
    settled.current = pageKey(tableId, recordId);
    return (
      <Seeded tableId={tableId} seed={mine}>
        {children}
      </Seeded>
    );
  }
  // No server seed: the browser's own reads (already running) draw the page the moment they land.
  return <>{skeleton}</>;
}

/**
 * THE BROWSER ASKS AT HYDRATION, NEVER AFTER THE SERVER'S BOUNDARY: started in the mount's first
 * browser render, outside the boundary the server's seed streams into, and raced against it.
 */
function useOwnSeed(
  tableId: string,
  recordId: string | null,
  seed: Promise<TablePageSeed | null>,
  opening: Promise<TablePageSeed | null> | undefined,
  rows: boolean,
): OwnSeed | null {
  const dataSource = useRecordsDataSource();
  const userId = useAppSelector(selectUserId);
  const key = pageKey(tableId, recordId);
  const asking = useRef<{ key: string; answer: Promise<TablePageSeed | null> } | null>(null);
  if (typeof window !== "undefined" && asking.current?.key !== key) {
    asking.current = { key, answer: askClientTableSeed(dataSource, tableId, { userId, rows, recordId, server: seed, opening }) };
  }
  const [own, setOwn] = useState<OwnSeed | null>(null);
  useEffect(() => {
    const asked = asking.current;
    if (!asked) return;
    let current = true;
    void asked.answer.then((answered) => {
      if (current) setOwn({ key: asked.key, seed: answered });
    });
    return () => {
      current = false;
    };
  }, [key]);
  return own;
}

export function PrimedTablePage({
  tableId,
  seed,
  gate,
  opening,
  rows = true,
}: {
  tableId: string;
  seed: Promise<TablePageSeed | null>;
  gate: Promise<ServerRowsGate>;
  /** The server's where + bundle, uncapped (`readTablePage`): the browser's reads take their doors from it. */
  opening?: Promise<TablePageSeed | null>;
  /** The address opens the plain table (`addressAsksThePlainOpening`): the grid's first page is asked. */
  rows?: boolean;
}) {
  useHoldShellUntilRows(tableId);
  const own = useOwnSeed(tableId, null, seed, opening, rows);
  const settled = useRef<string | null>(null);
  const skeleton = <TableRouteSkeleton tableId={tableId} />;
  return (
    <Suspense fallback={skeleton}>
      <RacedPage tableId={tableId} recordId={null} gate={gate} seed={seed} own={own} settled={settled} skeleton={skeleton}>
        <UnifiedDataTablePage tableId={tableId} />
      </RacedPage>
    </Suspense>
  );
}

/** The record page, raced the same way: its record's bundle from the server's seed or the browser's own. */
export function PrimedRecordPage({
  tableId,
  recordId,
  seed,
  gate,
  opening,
}: {
  tableId: string;
  recordId: string;
  seed: Promise<TablePageSeed | null>;
  gate: Promise<ServerRowsGate>;
  opening?: Promise<TablePageSeed | null>;
}) {
  const own = useOwnSeed(tableId, recordId, seed, opening, false);
  const settled = useRef<string | null>(null);
  const skeleton = <RecordRouteSkeleton />;
  return (
    <Suspense fallback={skeleton}>
      <RacedPage tableId={tableId} recordId={recordId} gate={gate} seed={seed} own={own} settled={settled} skeleton={skeleton}>
        <UnifiedRecordPage tableId={tableId} recordId={recordId} />
      </RacedPage>
    </Suspense>
  );
}
