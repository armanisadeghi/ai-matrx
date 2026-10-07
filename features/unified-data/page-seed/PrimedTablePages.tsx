"use client";

// features/unified-data/page-seed/PrimedTablePages.tsx — lane PAGE-BUNDLE-2
//
// The /data/<table> and /data/<table>/r/<record> mounts, handed the server's first reads
// (`tablePageSeed.server.ts`) and priming them into the page's own stores during the FIRST render —
// before any of the page's effects ask. The screens themselves are unchanged.

import { useRef, type ReactNode } from "react";

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

export function PrimedTablePage({ tableId, seed }: { tableId: string; seed: Promise<TablePageSeed | null> }) {
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
