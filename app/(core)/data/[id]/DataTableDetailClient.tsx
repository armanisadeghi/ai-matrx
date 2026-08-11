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

import { useState } from "react";
import { useRouter } from "next/navigation";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import UserTableViewer, {
  type TableInfo,
} from "@/components/user-generated-table-data/UserTableViewer";
import TableIdentityMenu, {
  type TableSummary,
} from "@/components/user-generated-table-data/TableIdentityMenu";
import CreateTableModal from "@/components/user-generated-table-data/CreateTableModal";

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

  const displayName = renamedTo ?? tableInfo?.table_name ?? "Loading...";

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/data" ariaLabel="Back to tables" />
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
          </>
        }
      />
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <UserTableViewer
          tableId={tableId}
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
