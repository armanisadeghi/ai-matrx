"use client";

// DataTableDetailClient — shell header + body for /data/[id].
//
// Back tap-target + the table's own name as the header identity (no
// sibling dropdown — UserTableViewer's inline table selector, shown via
// `showTableSelector`, already covers switching tables without a second
// control competing for the same job). The name comes from
// `onTableInfoChange`, which UserTableViewer already fires from its single
// `get_user_table_complete` load — no duplicate fetch for the header.

import { useState } from "react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import UserTableViewer, {
  type TableInfo,
} from "@/components/user-generated-table-data/UserTableViewer";

interface DataTableDetailClientProps {
  tableId: string;
}

export default function DataTableDetailClient({
  tableId,
}: DataTableDetailClientProps) {
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/data" ariaLabel="Back to tables" />
            <span className="ml-1.5 truncate max-w-[55vw] sm:max-w-[240px] text-sm font-medium text-foreground">
              {tableInfo?.table_name ?? "Loading..."}
            </span>
          </>
        }
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-none pt-[var(--shell-header-h)] p-4">
          <UserTableViewer
            tableId={tableId}
            showTableSelector
            hideHeader
            onTableInfoChange={setTableInfo}
          />
        </div>
      </div>
    </>
  );
}
