"use client";

// DataTableDetailClient — shell header + body for /data/[id].
//
// The header carries ONE identity control (<TableIdentityMenu>): it shows the
// table name, renames it in place, switches tables, and creates a new one.
// It replaced the previous pair — a title span here PLUS a full-width `Select`
// card inside UserTableViewer that repeated the same name — which is the exact
// duplication the route-header rules forbid.
//
// Both the name and the table list come from loads UserTableViewer already
// performs (`get_user_table_complete` / `get_user_tables`), surfaced through
// `onTableInfoChange` / `onTablesChange` — no duplicate fetch for the header.
//
// The body is a single full-height band: the viewer runs in `fillHeight` mode
// so the grid takes every available pixel and the pagination bar sits on the
// bottom edge, instead of a 70dvh grid floating above dead space.
//
// THIS ROUTE IS THE OLDER SIDE, AND ONLY THE OLDER SIDE (owner's ruling, 2026-09-23:
// "don't redirect anything at all right now"). /data/<id> opens the older viewer over the
// older store, exactly as it always did; /data-v2/<id> is the new side, side by side, so the
// two can be compared everywhere. Nothing here asks the record store, sends anyone to
// /data-v2, or talks about a move. The one flip later moves everything at once.

import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import UserTableViewer, {
  type TableInfo,
} from "@/components/user-generated-table-data/UserTableViewer";
import TableIdentityMenu, {
  type TableSummary,
} from "@/components/user-generated-table-data/TableIdentityMenu";
import CreateTableModal from "@/components/user-generated-table-data/CreateTableModal";
import { forgetTablePlacement } from "@/features/data-tables/data-source/table-home";

interface DataTableDetailClientProps {
  tableId: string;
}

export default function DataTableDetailClient({
  tableId,
}: DataTableDetailClientProps) {
  const router = useRouter();
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  // A rename is written by the menu itself; this keeps the header label in
  // sync without refetching the table just to read back a name we set.
  const [renamedTo, setRenamedTo] = useState<string | null>(null);
  // The older viewer over the older store: a placement the /data-v2 Sheet made for this id
  // earlier in the same visit must not carry over and point this viewer at the record store.
  const [unplaced, setUnplaced] = useState(false);
  useLayoutEffect(() => {
    forgetTablePlacement(tableId);
    setUnplaced(true);
  }, [tableId]);
  // The older store said this id is not one of its datasets for this person.
  const [notFound, setNotFound] = useState(false);

  const displayName = renamedTo ?? tableInfo?.table_name ?? "Loading...";

  const notHere = useCallback(() => {
    setNotFound(true);
  }, []);

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/data" ariaLabel="Back to tables" />
            <div data-surface-value="table_id">
              <div data-surface-value="table_name">
                <TableIdentityMenu
                  tableId={tableId}
                  tableName={displayName}
                  tables={tables}
                  onRenamed={(next) => {
                    setRenamedTo(next);
                    setTables((prev) =>
                      prev.map((t) =>
                        t.id === tableId ? { ...t, table_name: next } : t,
                      ),
                    );
                  }}
                  onCreateTable={() => setCreateOpen(true)}
                />
              </div>
            </div>
          </>
        }
      />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        {notFound ? (
          // THE CANONICAL NO ACCESS PAGE (ACTIVE-ORG-PAGES, VERIFIER-17 H3). The older store's
          // door answered "not available to this account" — RLS hid the row, which never
          // consulted the active organization — so the page says what is true through the one
          // access surface, and never guesses that the sender "was in a different organization".
          <AccessGate token="dataset" id={tableId} fallbackHref="/data" fallbackLabel="Your tables" />
        ) : !unplaced ? null : (
        <UserTableViewer
          tableId={tableId}
          onDatasetNotHere={notHere}
          fillHeight
          hideHeader
          // This route is the ONE mount that emits `matrx-user/data-tables`
          // (live agent scope + the table_description / cell_value write
          // targets). The viewer is also rendered inside overlays owned by
          // other surfaces, so the provider is opt-in — see the prop's docs.
          emitSurfaceScope
          onTableInfoChange={(info) => {
            setTableInfo(info);
            setRenamedTo(null);
          }}
          onTablesChange={setTables}
        />
        )}
      </div>

      <CreateTableModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(newId) => {
          setCreateOpen(false);
          router.push(`/data/${newId}`);
        }}
      />
    </>
  );
}
