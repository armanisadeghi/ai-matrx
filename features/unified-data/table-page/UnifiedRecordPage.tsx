"use client";

// features/unified-data/table-page/UnifiedRecordPage.tsx — ONE RECORD, ITS OWN PAGE.
//
// The record panel the table's rail draws (records-ui `RecordPanel`: the form, history, what ran on
// it, checklists, comments) — the same component, full page, never a second renderer. Everything
// around it — whose table this is, the store switch, the mount, access states — is the table page's
// own `useUnifiedTable` / `UnifiedTableBody`, so a record opens exactly when its table would.

import { useRouter } from "next/navigation";
import { RecordPanel, RecordsSkeleton, recordNameIn } from "@ai-matrx/records-ui";
import { useRecord, useTable } from "@ai-matrx/records/react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { NO_ADDRESS, UnifiedTableBody, useUnifiedTable } from "@/features/unified-data/table-page/UnifiedTable";

function RecordCrumbs({ tableId, recordId }: { tableId: string; recordId: string }) {
  const router = useRouter();
  const table = useTable(tableId);
  const record = useRecord(recordId);
  const tableName = table.data?.name?.trim() || "Table";
  const recordName = record.data?.document ? recordNameIn(table.data, record.data.document) : "";
  const tableHref = `/data/${encodeURIComponent(tableId)}`;
  return (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton
            variant="transparent"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) router.back();
              else router.push(tableHref);
            }}
            ariaLabel="Back"
          />
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 px-1.5 text-sm">
            <a href={tableHref} className="truncate text-muted-foreground hover:text-foreground" data-record-page-table="">
              {tableName}
            </a>
            <span aria-hidden="true" className="text-muted-foreground">/</span>
            <span className="truncate font-medium text-foreground" data-record-page-title="">
              {recordName}
            </span>
          </nav>
        </>
      }
    />
  );
}

export function UnifiedRecordPage({ tableId, recordId }: { tableId: string; recordId: string }) {
  const router = useRouter();
  const mount = useUnifiedTable({ tableId, address: NO_ADDRESS });
  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <div className="mx-auto w-full max-w-3xl p-4">
        <UnifiedTableBody
          mount={mount}
          onLeave={() => router.push(mount.allTablesHref)}
          /* A property page, not a grid, while the table is found (STABLE-TABLES). */
          skeleton={<RecordsSkeleton layout="record" embedded />}
          content={
            <>
              <RecordCrumbs tableId={tableId} recordId={recordId} />
              <RecordPanel tableId={tableId} recordId={recordId} onPage />
            </>
          }
        />
      </div>
    </div>
  );
}
