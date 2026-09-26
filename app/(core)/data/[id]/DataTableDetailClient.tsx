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
// two can be compared everywhere. The one flip later moves everything at once.
//
// AFTER THE FLIP (lane SWITCH-AFTERMATH, 2026-09-26). When the table's organization has pressed
// Data tables → new system, its older table is archived and the same-id copy in the record store IS
// the table (the switch card promises "any link to it opens the copy"). Before this lane the route
// still mounted the older viewer, which read the ARCHIVED older rows through get_full_table /
// get_user_table_data_paginated_v2 — a page that looked exactly like before and could be edited
// into a table nobody reads any more. Now the route asks the one answer (`tableLivesIn`, the store's
// custom.where_tables_live, read from the switch) first: "record" mounts the new table page — the
// same screen /data-v2/<id> is — under one line saying where the table lives; "older" mounts the
// older viewer exactly as before. Same id, same address; no redirect.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
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
import Link from "next/link";
import { supabase } from "@/utils/supabase/client";
import { tableLivesIn } from "@/features/unified-data/tableLivesIn";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Button } from "@ai-matrx/design-system";
import { LivesInTheNewSystem } from "@/app/(core)/data-v2/[tableId]/LivesInTheNewSystem";

/** Where this id is read and written, asked of the store once per id. */
type Home =
  | { state: "asking" }
  | { state: "older" }
  | { state: "record" }
  | { state: "unknown"; why: string };

function useWhereThisTableLives(tableId: string): Home & { retry: () => void } {
  const [home, setHome] = useState<Home>({ state: "asking" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setHome({ state: "asking" });
    void tableLivesIn(supabase, tableId).then((answer) => {
      if (!alive) return;
      setHome(answer.ok ? { state: answer.livesIn } : { state: "unknown", why: answer.why });
    });
    return () => {
      alive = false;
    };
  }, [tableId, attempt]);
  return { ...home, retry: () => setAttempt((n) => n + 1) };
}

/**
 * THE TABLE LIVES IN THE NEW SYSTEM. The new table page (records-ui TablePage, the /data-v2 screen)
 * under one line that says so; the line names where to switch back.
 */
function MovedTable({ tableId }: { tableId: string }) {
  return (
    <LivesInTheNewSystem tableId={tableId} testId="table-lives-in-new-system">
      This table now lives in the new system. Same table, same address; its organization switched its
      Data tables. <Link href="/data" className="text-primary underline-offset-2 hover:underline">All tables</Link>
    </LivesInTheNewSystem>
  );
}

interface DataTableDetailClientProps {
  tableId: string;
}

export default function DataTableDetailClient({
  tableId,
}: DataTableDetailClientProps) {
  const home = useWhereThisTableLives(tableId);
  if (home.state === "record") return <MovedTable tableId={tableId} />;
  if (home.state === "asking") {
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <p className="p-4 text-sm text-muted-foreground">Opening the table&hellip;</p>
      </div>
    );
  }
  if (home.state === "unknown") {
    return (
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <div className="m-4 flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <p className="text-sm font-medium">We could not find out where this table lives <ErrorAlchemyMenu /></p>
          <p className="max-w-prose text-xs text-muted-foreground">
            Nothing was opened. This is not an answer about your access. {home.why}
          </p>
          <Button size="sm" variant="outline" onClick={home.retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  return <OlderTableDetail tableId={tableId} />;
}

/** The older viewer over the older store, exactly as before the switch. */
function OlderTableDetail({ tableId }: DataTableDetailClientProps) {
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
