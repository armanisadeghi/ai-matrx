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
import { TableRouteSkeleton } from "./TableRouteSkeleton";
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
function RacedTable({
  tableId,
  gate,
  seed,
  own,
  settled,
  children,
}: {
  tableId: string;
  gate: Promise<ServerRowsGate>;
  seed: Promise<TablePageSeed | null>;
  own: { tableId: string; seed: TablePageSeed | null } | null;
  settled: RefObject<string | null>;
  children: ReactNode;
}) {
  // Two components, so the one that waits on the server (`use`) is never the one the browser's
  // answer replaces it with.
  if (own && own.tableId === tableId && settled.current !== tableId) {
    return (
      <Seeded tableId={tableId} seed={own.seed}>
        {children}
      </Seeded>
    );
  }
  return (
    <ServerDrawn tableId={tableId} gate={gate} seed={seed} settled={settled}>
      {children}
    </ServerDrawn>
  );
}

function ServerDrawn({
  tableId,
  gate,
  seed,
  settled,
  children,
}: {
  tableId: string;
  gate: Promise<ServerRowsGate>;
  seed: Promise<TablePageSeed | null>;
  settled: RefObject<string | null>;
  children: ReactNode;
}) {
  const server = use(gate).on ? use(seed) : null;
  const mine = server && server.tableId === tableId && server.records ? server : null;
  if (mine) {
    settled.current = tableId;
    return (
      <Seeded tableId={tableId} seed={mine}>
        {children}
      </Seeded>
    );
  }
  // No server rows: the browser's own reads (already running) draw the page the moment they land.
  return <TableRouteSkeleton tableId={tableId} />;
}

export function PrimedTablePage({
  tableId,
  seed,
  gate,
  rows = true,
}: {
  tableId: string;
  seed: Promise<TablePageSeed | null>;
  gate: Promise<ServerRowsGate>;
  /** The address opens the plain table (`addressAsksThePlainOpening`): the grid's first page is asked. */
  rows?: boolean;
}) {
  useHoldShellUntilRows(tableId);
  const dataSource = useRecordsDataSource();
  const userId = useAppSelector(selectUserId);
  // THE BROWSER ASKS AT HYDRATION, NEVER AFTER THE SERVER'S BOUNDARY: started in this component's
  // first browser render, outside the boundary the server's rows stream into.
  const asking = useRef<{ tableId: string; answer: Promise<TablePageSeed | null> } | null>(null);
  if (typeof window !== "undefined" && asking.current?.tableId !== tableId) {
    asking.current = { tableId, answer: askClientTableSeed(dataSource, tableId, { userId, rows }) };
  }
  const [own, setOwn] = useState<{ tableId: string; seed: TablePageSeed | null } | null>(null);
  useEffect(() => {
    const asked = asking.current;
    if (!asked) return;
    let current = true;
    void asked.answer.then((answered) => {
      if (current) setOwn({ tableId: asked.tableId, seed: answered });
    });
    return () => {
      current = false;
    };
  }, [tableId]);
  const settled = useRef<string | null>(null);
  return (
    <Suspense fallback={<TableRouteSkeleton tableId={tableId} />}>
      <RacedTable tableId={tableId} gate={gate} seed={seed} own={own} settled={settled}>
        <UnifiedDataTablePage tableId={tableId} />
      </RacedTable>
    </Suspense>
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
