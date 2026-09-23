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
// AN ID FROM THE OTHER STORE IS NOT A DEAD END. There are two table viewers
// taking the same shape of id — this one over `workbench.udt_datasets` and
// `/data-v2` over the record store — and until 2026-09-21 this route answered
// every record-store table with "We couldn't open this dataset. It may have
// been deleted, or it may belong to an organization you don't have access to",
// which was false twice over for a table the person owns one route along. When
// the older store says the id is not one of its datasets, we ASK the record
// store (`whereThisTableLives`, through its own client door) and send the person
// where their table actually is. If it is in neither, the screen says exactly
// that, naming both places it looked — never a guess about deletion or access.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import UserTableViewer, {
  type TableInfo,
} from "@/components/user-generated-table-data/UserTableViewer";
import TableIdentityMenu, {
  type TableSummary,
} from "@/components/user-generated-table-data/TableIdentityMenu";
import CreateTableModal from "@/components/user-generated-table-data/CreateTableModal";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { createClient } from "@/utils/supabase/client";
import { whereThisTableLives } from "@/features/unified-data/whereThisTableLives";
import { RECORD_STORE_TABLES_OPEN_IN } from "@/features/data-tables/data-source/d3";
import {
  placeTableInRecordStore,
  recordStoreHomeOf,
} from "@/features/data-tables/data-source/table-home";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

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
  const { organizationId, organizationState } = useOrganizationRequired();
  const userId = useAppSelector(selectUserId);
  // WHICH STORE THE GRID IS READING (decision D3, `data-source/d3.ts`). A table
  // the record store holds opens in THIS grid, with the record-store half of the
  // data seam behind it; the key remounts the viewer onto that half the moment
  // the table is placed, so nothing it read from the older store survives.
  const [placedIn, setPlacedIn] = useState<"older" | "record">(() =>
    recordStoreHomeOf(tableId) ? "record" : "older",
  );
  // WHERE THE TABLE LIVES IS ASKED FIRST (VERIFIER-16). The record store answers before
  // the older store is read, so a table it holds — moved, or never shared with this person —
  // never reaches the older doors (which answered it with a 500 and a sentence about
  // deletion). "older" mounts the older viewer; "record" mounts it over the record store.
  const [lookup, setLookup] = useState<
    | { kind: "asking" }
    | { kind: "older"; storeSaid: "nowhere" | { why: string } }
    | { kind: "record" }
    | { kind: "no_access" }
  >(() => (recordStoreHomeOf(tableId) ? { kind: "record" } : { kind: "asking" }));
  // The older viewer said the id is not one of its datasets (or is one that moved).
  const [olderSaysNotHere, setOlderSaysNotHere] = useState(false);

  const displayName = renamedTo ?? tableInfo?.table_name ?? "Loading...";

  const notHere = useCallback(() => {
    setOlderSaysNotHere(true);
  }, []);

  useEffect(() => {
    if (lookup.kind !== "asking") return;
    if (organizationState === "resolving") return; // still looking; say nothing yet
    if (organizationState === "required") {
      setLookup({
        kind: "older",
        storeSaid: {
          why: "no organization is chosen yet, and a table in the record store belongs to one — choose an organization and this page will find it",
        },
      });
      return;
    }
    if (organizationState === "unavailable" || !organizationId) {
      setLookup({
        kind: "older",
        storeSaid: { why: "your organizations could not be read just now, so the record store could not be asked" },
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      const found = await whereThisTableLives(createClient(), organizationId, tableId);
      if (cancelled) return;
      if (found.kind === "record_store") {
        if (RECORD_STORE_TABLES_OPEN_IN === "data-v2") {
          router.replace(found.href);
          return;
        }
        placeTableInRecordStore(tableId, { organizationId, userId: userId ?? null });
        setPlacedIn("record");
        setLookup({ kind: "record" });
        return;
      }
      if (found.kind === "no_access") {
        setLookup({ kind: "no_access" });
        return;
      }
      setLookup({ kind: "older", storeSaid: found.kind === "nowhere" ? "nowhere" : { why: found.why } });
    })();
    return () => {
      cancelled = true;
    };
  }, [lookup.kind, organizationId, organizationState, router, tableId, userId]);

  // What the panel says instead of the grid, when it says anything.
  const elsewhere:
    | null
    | { kind: "looking" }
    | { kind: "no_access" }
    | { kind: "nowhere" }
    | { kind: "unknown"; why: string } =
    lookup.kind === "asking"
      ? { kind: "looking" }
      : lookup.kind === "no_access"
        ? { kind: "no_access" }
        : lookup.kind === "older" && olderSaysNotHere
          ? lookup.storeSaid === "nowhere"
            ? { kind: "nowhere" }
            : { kind: "unknown", why: lookup.storeSaid.why }
          : null;

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
        {elsewhere ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-xl rounded-lg border border-border bg-card p-6 text-card-foreground">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4" aria-hidden />
                <span className="text-sm font-medium">
                  {elsewhere.kind === "looking"
                    ? "Looking for this table"
                    : elsewhere.kind === "no_access"
                      ? "This table has not been shared with you"
                      : elsewhere.kind === "nowhere"
                        ? "This table is not in either store"
                        : "We could not find out where this table is"}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {elsewhere.kind === "looking" ? (
                  <>Checking where this table lives.</>
                ) : elsewhere.kind === "no_access" ? (
                  <>
                    The table exists in this organization, but nobody has shared it with you yet. Ask the person who
                    sent you the link, or an owner of this organization, to share it with you &mdash; it will open here
                    as soon as they do.
                  </>
                ) : elsewhere.kind === "nowhere" ? (
                  <>
                    We looked in both places a table can live &mdash; this store&rsquo;s datasets and the record
                    store &mdash; and this link&rsquo;s table is in neither of them for this organization. If somebody
                    sent you this link, they may have been in a different organization.
                  </>
                ) : (
                  <>
                    This id is not one of this store&rsquo;s datasets, and we could not ask the record store: {elsewhere.why}.
                    Nothing has been deleted as far as we know &mdash; this is a question we could not get an answer to.
                  </>
                )}
              </p>
              {elsewhere.kind !== "looking" ? (
                <button
                  type="button"
                  className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => router.push("/data")}
                >
                  Back to tables
                </button>
              ) : null}
            </div>
          </div>
        ) : (
        <UserTableViewer
          key={`${tableId}:${placedIn}`}
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
            // A TABLE THAT WAS MOVED IS NOT "HERE" EVEN THOUGH ITS ROW STILL IS. The move
            // archives the older dataset and writes `metadata.moved_to` — it never deletes
            // it — and this viewer's reads do not filter archived datasets, so an old link
            // opened the archived copy as if nothing had happened (found by lane
            // OLD-TABLES-4's headless walk). The pointer is the answer: ask the record
            // store, exactly as for an id the older store does not know.
            // An UNARCHIVED table keeps `moved_to` as history and gains `unarchived_at`
            // (workbench.udt_dataset_unarchive) — that is the undo, and it must open here.
            // The viewer reports `null` while it is still loading — nothing to judge yet.
            const meta = info?.metadata as
              | { moved_to?: { table_id?: string; at?: string }; unarchived_at?: string }
              | undefined;
            const movedTo = meta?.moved_to;
            const stillMoved =
              Boolean(movedTo?.table_id) &&
              (!meta?.unarchived_at || String(movedTo?.at ?? "") > String(meta.unarchived_at));
            if (stillMoved && placedIn === "older") {
              notHere();
              return;
            }
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
