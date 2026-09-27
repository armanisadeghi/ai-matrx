"use client";

/**
 * THE GRID, OPENED BY ID ANYWHERE OUTSIDE THE TABLE PAGE (lane INTEG-CLIENTS, CUTOVER-PLAN F2/F3).
 *
 * `UserTableViewer` reads through the data seam, and the seam dispatches by where the table
 * is PLACED — which only the table page (`/data-v2`'s Sheet layout) ever did. Every other host
 * that opens a table by id — the Quick Data sheet, the table window, the chat "view table"
 * modal, a canvas table, a tool result's dataset overlay, the agent-resources preview — mounted
 * the viewer UNPLACED, so a moved table was read from its archived older copy (or refused by the
 * older door) and a table born in the record store did not open at all.
 *
 * This host asks where the table lives (`locateTable`: the record store's Table kernel by id)
 * BEFORE anything mounts. An older table mounts `UserTableViewer` exactly as before. A
 * RECORD-STORE table never reaches `UserTableViewer` (one-grid merge, step 7): it mounts
 * records-ui's table page through the ONE host binding the /data-v2 page uses
 * (`RecordStoreTableHost`), and the `data_tables.merged_grid` Feature Knob picks its grid. A table
 * the person was not given, or a store that could not be asked, is said in words — never an
 * empty grid.
 */

import { useEffect, useState, type ComponentProps } from "react";
import { History } from "lucide-react";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { locateTable, recordStoreCopyOf } from "@/features/data-tables/data-source/locate-table";
import { RecordStoreTableHost } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type ViewerProps = ComponentProps<typeof UserTableViewer> & {
  /**
   * The host's own actions for a RECORD-STORE table, drawn in the table's one menu (records-ui
   * `TablePage.menuExtras`) — the record-store twin of `toolbarTrailing`, which only the older
   * viewer draws. Never a second toolbar row.
   */
  recordStoreMenuExtras?: Array<{ key: string; label: string; onSelect: () => void }>;
  /**
   * A PREVIEW (the tables picker): read-only in either grid — the records-ui `rights` port for a
   * record-store table, `previewOnly` for an older one.
   */
  readOnly?: boolean;
};

type Located =
  /** `copyInRecordStore`: the new store also holds it (the lead's flip has not moved it yet). */
  | { tableId: string; state: "older"; copyInRecordStore: boolean }
  | { tableId: string; state: "record"; organizationId: string }
  | { tableId: string; state: "refused"; why: string };

export function LocatedTableViewer({ recordStoreMenuExtras, readOnly = false, ...props }: ViewerProps) {
  const { tableId } = props;
  const [located, setLocated] = useState<Located | null>(null);

  useEffect(() => {
    let cancelled = false;
    void locateTable(tableId)
      .then(async (answer) => {
        // A TABLE IN BOTH STORES (review 2, fix lane F item 2): it resolves to the older store
        // until the custom-data lead's one flip — that is his routing and it is correct. The older
        // grid then SAYS so, instead of drawing silently with the merged-grid knob on.
        const copyInRecordStore = answer.ok && answer.store === "older" ? await recordStoreCopyOf(tableId) : false;
        if (cancelled) return;
        setLocated(
          !answer.ok
            ? { tableId, state: "refused", why: answer.error }
            : answer.store === "record"
              ? { tableId, state: "record", organizationId: answer.home.organizationId }
              : { tableId, state: "older", copyInRecordStore },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLocated({
          tableId,
          state: "refused",
          why: err instanceof Error ? err.message : "This table could not be opened.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  if (!located || located.tableId !== tableId) {
    return (
      <div className="flex h-full min-h-24 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (located.state === "refused") {
    return (
      <div className="flex h-full min-h-24 items-center justify-center p-4 text-sm text-muted-foreground" role="status">
        {located.why}
        <ErrorAlchemyMenu error={located.why} />
      </div>
    );
  }
  if (located.state === "record") {
    return (
      <RecordStoreTableHost
        tableId={tableId}
        organizationId={located.organizationId}
        menuExtras={recordStoreMenuExtras}
        readOnly={readOnly}
      />
    );
  }
  if (!located.copyInRecordStore) return <UserTableViewer {...props} {...(readOnly ? { previewOnly: true } : {})} />;
  return (
    <UserTableViewer
      {...props}
      {...(readOnly ? { previewOnly: true } : {})}
      toolbarTrailing={
        <>
          <OlderStoreNotice />
          {props.toolbarTrailing}
        </>
      }
    />
  );
}

/**
 * THE OLDER GRID SAYS WHY IT IS DRAWN, in its own toolbar row (the read-only chip's pattern) — never
 * a second row, a redirect, or a second grid.
 */
function OlderStoreNotice() {
  return (
    <span
      role="note"
      data-table-store-notice="older"
      className="inline-flex max-w-full shrink items-center gap-1.5 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
      title="The new store also holds a copy of this table. It opens there once an owner switches this organization's Data tables over."
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">This table still runs in the older store until it is switched over</span>
    </span>
  );
}

export default LocatedTableViewer;
