"use client";

// features/unified-data/table-page/UnifiedDataTablePage.tsx — THE TABLE PAGE, MOUNTABLE ANYWHERE.
//
// The screen /data/<id> renders, as a feature component so every other mount (/data/<id>,
// /pick-lists/<id>, the picklist windows) imports THIS and never the route's `page` module: a route
// group is parked out of some Vercel builds (manage.aimatrx.com parks app/(core)), so a feature
// that imports a page breaks that build. `pnpm check:page-imports` holds the line.
//
// `TablePage` from `@ai-matrx/records-ui` is the whole screen: the view bar and
// the four layouts, the record peek with its own versioned history and comment
// thread, the settings panel, the action inbox, import and export. None of it
// is assembled here, because a table opened from a portal or from an agent's
// link must be the same screen.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@ai-matrx/records/react";
import { SyncedTableBar } from "@/features/unified-data/connect-database/SyncedTableBar";
import type { PageView, ViewAddressState } from "@ai-matrx/records-ui";
import { VIEW_ADDRESS_KEYS, viewAddressFromParams, viewAddressToParams } from "@ai-matrx/records-ui";
import type { RecordFilter } from "@ai-matrx/records";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TableFavoriteStar } from "./TableFavoriteStar";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { TableSwitcher } from "@/features/unified-data/components/TableSwitcher";
import { useDeclarePageObjectOrganization } from "@/features/shell/pageObjectOrganization";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { replaceAddressWithoutNavigating, currentPathWithSearch } from "@/lib/url-state/addressWithoutNavigating";
import { HeldWritesOnTable } from "@/features/record-change-approvals/HeldWritesOnTable";
import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { tablePageCapture } from "@/components/agent-copy/page-capture/pageCapture";
import { useTableCaptureContribution } from "@/features/unified-data/page-capture/useTableCaptureContribution";
import { shownViewSelection, type ShownViewLike } from "@/features/unified-data/page-capture/shownViewCapture";
import {
  UnifiedTableBody,
  filterFromAddress,
  useUnifiedTable,
  type TableAddress,
} from "@/features/unified-data/table-page/UnifiedTable";

/**
 * THE PAGE'S HEADER — the app's standard one (lane TABLE-PAGE-CHROME, owner 2026-09-25: "Align with
 * the app's top-tier pages … Add a standard back button. Enable clickable table title to switch
 * between tables. Remove the bottom border on the header."). Back; the table's own name as the
 * switcher (the tables of its organization, search, All tables, and where it lives with Move at
 * the foot); on the right, the table page's own Share and one menu, handed over by records-ui's
 * `TablePage.header`, then the alchemy capture. No organization line: the shell's organization
 * indicator lights when the table lives somewhere other than the organization she works in.
 * `RouteHeader` is the /data/<id> and /agents/<id> composition (glass strip, no border).
 */
function TableRouteHeader({
  tableId,
  actions,
  allTablesHref,
  switcherFooter,
  fallback = false,
  organizationId = null,
}: {
  tableId: string;
  /** The TABLE's organization — where its held writes wait (VERIFIER-26 item 5). */
  organizationId?: string | null;
  actions?: ReactNode;
  allTablesHref: string;
  switcherFooter?: ReactNode;
  fallback?: boolean;
}) {
  const router = useRouter();
  const table = useTable(tableId);
  const name = table.data?.name?.trim();
  // Back is the person's own last page (the app's rule); a link opened cold goes to the tables.
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(allTablesHref);
  };
  return (
    <RouteHeader
      fallback={fallback}
      left={
        <>
          <ChevronLeftTapButton variant="transparent" onClick={back} ariaLabel="Back" />
          {name ? (
            <>
              <TableSwitcher tableId={tableId} name={name} allTablesHref={allTablesHref} footer={switcherFooter} />
              <TableFavoriteStar tableId={tableId} organizationId={organizationId} />
            </>
          ) : (
            <span className="truncate px-1.5 text-sm font-medium text-foreground">Data</span>
          )}
        </>
      }
      right={
        <>
          {/* A write the store held for a person, decided from here as well as from the chat.
              Absent unless something is waiting. */}
          <HeldWritesOnTable key="held" tableId={tableId} organizationId={organizationId} />
          {/* Synced from outside: the chip and Refresh (lane VISION-REACH wave 3). Absent otherwise. */}
          <SyncedTableBar key="synced" tableId={tableId} organizationId={organizationId} />
          {/* ONE copy/export on this page (merged-grid review 2, D6: two identical buttons, header and
              toolbar): the table's own, in its toolbar's copy/export menu. The page capture below is
              still registered, so agents and "Copy full context" read it. */}
          {actions}
        </>
      }
    />
  );
}

/**
 * The alchemy capture's record-store half: the table's name and declaration, and its records and
 * open record read at copy time through the grid's own door (lane ALCHEMY-BUTTON). Mounted once.
 */
function TableCapture({
  tableId,
  filter,
  recordId,
}: {
  tableId: string;
  filter?: RecordFilter | null;
  recordId?: string | null;
}) {
  const table = useTable(tableId);
  useTableCaptureContribution({
    tableId,
    table: table.data,
    tableError: table.error ? String((table.error as { message?: string }).message ?? table.error) : null,
    filter,
    recordId,
  });
  return null;
}

export function UnifiedDataTablePage({ tableId }: { tableId: string }) {
  const router = useRouter();
  /**
   * THE ADDRESS IS THE PAGE'S STATE, AND EVERY LINK HAS TO LAND. Each of these was once a dead
   * link of the same shape — in the address and read by nothing (`?dashboard=` from
   * `dashboard_propose`, `?record=` from the ActionInbox's Open, `?view=` VERIFIER-8 HIGH-2,
   * `?rail=&item=` VERIFIER-14 item 2, `?filter=` lane DRILL). Every word is passed RAW to
   * `TablePage`, which says on screen when it does not know one; a `?filter=` that is not a JSON
   * object is dropped rather than half-applied. `?grid=merged` forces the merged grid for a walk;
   * otherwise the `data_tables.merged_grid` knob decides. `?org=` only matters while
   * `custom.where_id_opens` is absent — the table names its own organization.
   *
   * Everything below the address — where the table lives, the store switch, the mount, the
   * agent surface — is `useUnifiedTable` / `UnifiedTableBody`, the SAME component a Board tile
   * renders (`features/board/items/data-items.tsx`). This route adds only its chrome.
   */
  const searchParams = useSearchParams();
  const rawFilter = searchParams.get("filter");
  const filter = useMemo(() => filterFromAddress(rawFilter), [rawFilter]);
  const address: TableAddress = {
    dashboard: searchParams.get("dashboard"),
    record: searchParams.get("record"),
    view: searchParams.get("view"),
    rail: searchParams.get("rail"),
    item: searchParams.get("item"),
    group: searchParams.get("group"),
    from: searchParams.get("from"),
    filter,
    gridForced: searchParams.get("grid") === "merged",
  };
  const mount = useUnifiedTable({ tableId, address });
  const { object, shared, knownOrganizationName, readingOrganizationId, allTablesHref, whereItLives } = mount;
  const { organizations: myOrganizations } = useUserOrganizations();
  /**
   * THE VIEW AS DRAWN (V24-TAILS): TablePage reports the saved view with the person's look laid
   * over it, so the capture names "grouped by Trade (your own look)" and never "not chosen".
   */
  const [shownView, setShownView] = useState<ShownViewLike | null>(null);
  /**
   * AND THE ADDRESS FOLLOWS THEM. `replace` rather than `push`, and a history write, not
   * `router.replace`: switching a layout is bookkeeping on this page, never a server round trip
   * (lane URL-STATE). Read at change time, never closed over `searchParams` (lane RENDER-AUDIT).
   */
  const onViewChanged = useCallback((view: PageView | string) => {
    const next = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    next.set("view", view);
    replaceAddressWithoutNavigating(currentPathWithSearch(next));
  }, []);
  /**
   * THE VIEW IN THE ADDRESS (FTS-5): sort, column filters, search, hidden columns and page ride
   * `?sort= &cf= &q= &hide= &page=`. Read ONCE on arrival (the package opens on it); every change
   * the person makes is written back, replacing the entry, so a copied link opens the same look.
   * Same history write as the layout above.
   */
  const [viewAddress] = useState<ViewAddressState | null>(() =>
    viewAddressFromParams((key) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(key))),
  );
  const onViewAddressChange = useCallback((state: ViewAddressState | null) => {
    const next = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const key of VIEW_ADDRESS_KEYS) next.delete(key);
    for (const [key, value] of Object.entries(viewAddressToParams(state))) next.set(key, value);
    replaceAddressWithoutNavigating(currentPathWithSearch(next));
  }, []);
  /**
   * THE SHELL HEADER BELIEVES THE TABLE (GATES-TAIL, VERIFIER-21 #7). The table named its own
   * organization, so the header's red "Choose org" would be a lie: nothing here waits for a choice.
   */
  useDeclarePageObjectOrganization(
    object.state === "found"
      ? {
          organizationId: object.organizationId,
          name: knownOrganizationName,
          // TABLE-PAGE-CHROME: the shell's indicator names the organization, lit when it is not
          // the one she works in, and switches on click.
          shownByPage: false,
          member:
            shared.state === "shared"
              ? false
              : myOrganizations.some((o) => o.id === object.organizationId)
                ? true
                : null,
        }
      : null,
  );

  // ── The alchemy capture: this table page, what the address chose (view, rail, record,
  //    dashboard, filter), whose table it is, and why it did not open when it did not. ──
  const pageSays = mount.says;
  const pendingInvitation = mount.pendingInvitation;
  usePageCapture(() =>
    tablePageCapture({
      title: "Data table",
      route: `/data/${tableId}`,
      table: { id: tableId, name: null },
      view: address.view ?? "the table's default view (none named in the address)",
      selection: {
        Organization: { id: readingOrganizationId, name: knownOrganizationName },
        "Shared with you": shared.state === "shared" ? shared.levelLabel : null,
        Rail: address.rail,
        "Rail item": address.item,
        "Open record": address.record,
        Dashboard: address.dashboard,
        ...shownViewSelection(shownView, address.group),
        "Came from": address.from,
        Filter: filter ? JSON.stringify(filter) : rawFilter ? `ignored (not a JSON object): ${rawFilter}` : null,
      },
      errors: [
        object.state === "not-given" && !pendingInvitation ? pageSays : null,
        object.state === "unavailable" ? pageSays : null,
      ],
      sections: [
        {
          id: "page-state",
          title: "Page state",
          role: "data",
          value: {
            table_opens: object.state,
            says: pageSays ?? "The table is open.",
          },
        },
      ],
    }),
  );

  /** Archiving leaves to the table's organization's list (ACCESS-FIX-18, VERIFIER-18 H4). */
  const leaveTable = () => router.push(allTablesHref);
  /** THE HEADER, WITH THE TABLE PAGE'S OWN ACTIONS (records-ui `TablePage.header`, TABLE-PAGE-CHROME). */
  const header = ({ actions }: { actions: ReactNode }) => (
    <TableRouteHeader
      tableId={tableId}
      organizationId={readingOrganizationId}
      actions={actions}
      allTablesHref={allTablesHref}
      switcherFooter={whereItLives}
    />
  );
  /**
   * Above the table page: the header before records-ui hands over its actions (and, on an older
   * build that never calls `header`, the header itself), and the record-store half of the capture.
   */
  const before = (
    <>
      <TableRouteHeader
        fallback
        tableId={tableId}
        organizationId={readingOrganizationId}
        allTablesHref={allTablesHref}
        switcherFooter={whereItLives}
      />
      <TableCapture tableId={tableId} filter={filter} recordId={address.record} />
    </>
  );

  return (
    <>
      {/* THE BODY IS BOUNDED (core-route-headers): the table page fills it, so a sticky footer
          has a height to sit at the bottom of; the states before the table opens scroll. */}
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        {mount.mountsTheTable ? null : (
          <RouteHeader
            fallback
            left={
              <>
                <ChevronLeftTapButton variant="transparent" href="/data" ariaLabel="Back to your tables" />
                <span className="truncate px-1.5 text-sm font-medium text-foreground">Data</span>
              </>
            }
          />
        )}
        {/* While the table is still being found it already sits in the table's own padding: the
            page skeleton is drawn where the table will be (STABLE-TABLES). */}
        <div className={mount.mountsTheTable || mount.object.state === "resolving" ? "h-full overflow-y-auto px-3 pb-2 pt-1" : "h-full overflow-y-auto p-4"}>
          <UnifiedTableBody
            mount={mount}
            before={before}
            header={header}
            onLeave={leaveTable}
            onViewChanged={onViewChanged}
            viewAddress={viewAddress}
            onViewAddressChange={onViewAddressChange}
            onShownViewChange={setShownView}
          />
        </div>
      </div>
    </>
  );
}
