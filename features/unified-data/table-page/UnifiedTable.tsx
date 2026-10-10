"use client";

/**
 * ONE RECORD-STORE TABLE, MOUNTED — the part of `/data/[tableId]` that is not route chrome.
 *
 * `/data/[tableId]` and a Board tile (`features/board/items/data-items.tsx`) render the SAME
 * table page: records-ui's `TablePage` inside `RecordsMount`, reading as the TABLE's organization,
 * with the same ports, realtime, merged-grid knob, table action list and
 * `matrx-user/data-tables` agent surface (`RecordStoreTableSurface`). Only the route adds route
 * chrome: its header (back, title switcher), the shell's page-organization declaration, the page
 * capture, and the address the view follows.
 *
 *   const mount = useUnifiedTable({ tableId, address });
 *   <UnifiedTableBody mount={mount} … />
 *
 * The hook answers where the table lives and whether it can open; the body draws every state
 * (opening, not given, unavailable, organization needed, store switch off) and, when it opens,
 * the table itself.
 */

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RecordsMount, TablePage, TablePageSkeleton, WhereItLives, skeletonLayoutFor } from "@ai-matrx/records-ui";
import type { PageView, RecordsMountProps, TablePageActionHost, ViewAddressState } from "@ai-matrx/records-ui";
import type { RecordFilter } from "@ai-matrx/records";
import { Button } from "@ai-matrx/design-system";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TableTransferOffer } from "@/features/sharing/components/TableTransferOffer";
import {
  PendingTableInvitation,
  usePendingTableInvitation,
} from "@/features/sharing/outside/PendingTableInvitation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useSharedTable } from "@/features/unified-data/hub/useSharedTable";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { PREVIEW_RIGHTS, recordsUiHostFor, useAppRecordsConfig, useRecordsDataSource, useRecordsUiPorts } from "@/features/data-tables/records-ui-host/recordsUiHost";
import type { ObjectAction } from "@ai-matrx/records-ui/object-actions";
import { useMergedGridKnob } from "@/features/data-tables/records-ui-host/mergedGridKnob";
import { toast } from "@/lib/toast";
import { useRowChangeAgentOffer } from "@/features/unified-data/row-change-agent/RowChangeAgentLink";
import { tableMenuExtensions } from "@/features/unified-data/actions/tableMenuExtensions";
import { TableAutomationsDialog } from "@/features/unified-data/actions/TableAutomationsDialog";
import { useTableFavorite } from "@/features/unified-data/actions/useTableFavorite";
import { DataMenuProvider } from "@/features/unified-data/actions/DataMenuProvider";
import { useTablePageCommands } from "@/features/unified-data/actions/tableActionCommands";
import { RecordStoreTableSurface, useGridContextChannel } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import type { ShownViewLike } from "@/features/unified-data/page-capture/shownViewCapture";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * WHAT THE PAGE IS ASKED TO OPEN ON — the route reads it from its address (`?view=`, `?record=`,
 * `?dashboard=`, `?rail=&item=`, `?group=`, `?from=`, `?filter=`, `?grid=merged`); a
 * tile opens with none of it. Every word is passed RAW to `TablePage`, which says on screen when
 * it does not know one.
 */
export interface TableAddress {
  dashboard: string | null;
  record: string | null;
  view: string | null;
  rail: string | null;
  item: string | null;
  group: string | null;
  from: string | null;
  /** The store's filter shape, already read off the address (`filterFromAddress`). */
  filter: RecordFilter | null;
  /** `?grid=merged`: draw the merged grid whatever the knob says (a walk). */
  gridForced: boolean;
}

export const NO_ADDRESS: TableAddress = {
  dashboard: null,
  record: null,
  view: null,
  rail: null,
  item: null,
  group: null,
  from: null,
  filter: null,
  gridForced: false,
};

/**
 * The address's `?filter=` as the store's filter shape, or null. A parameter that is not JSON, or
 * is JSON that is not an object, is DROPPED rather than half-applied: a filter half-read is a
 * screen quietly showing a different set of records than its own sentence claims. A module
 * function, never inline in a component: a `try`/`catch` with a value block inside a component
 * makes the React Compiler skip the whole component (lane RENDER-AUDIT).
 */
export function filterFromAddress(rawFilter: string | null): RecordFilter | null {
  if (!rawFilter) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawFilter);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as RecordFilter;
}

export function useUnifiedTable({
  tableId,
  address,
  actionExtensions,
  readOnly = false,
}: {
  tableId: string;
  address: TableAddress;
  /**
   * A HOST'S OWN ENTRIES in the table's one action list ("Open in a floating window", "Revert to
   * text", …) — the window, a canvas table, the chat modal add theirs after this page's own.
   */
  actionExtensions?: readonly ObjectAction[];
  /** A PREVIEW (the tables picker): read-only whatever the person holds (records-ui `rights` port). */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  /** THE AGENT'S VIEW OF THE MERGED GRID (merge 6l): the grid tells the channel, the surface reads it. */
  const gridContext = useGridContextChannel();
  /** THE ONE DATA SEAM, built once. */
  const dataSource = useRecordsDataSource();
  /**
   * WHOSE TABLE THIS IS, ASKED OF THE TABLE — ACCESS IS PERSONAL (owner, 2026-09-23). The page
   * asks `custom.where_id_opens(<table>)` — the organization the table lives in, answered only
   * when this person may open it — and reads as THAT. The active organization is never read here
   * (`pnpm check:object-pages-read-the-objects-organization`).
   */
  const object = useObjectOrganization(dataSource, tableId);
  const { organizations: myOrganizations } = useUserOrganizations();
  /** A table another organization gave this person (see `useSharedTable`). */
  const shareHint = object.state === "found" ? object.organizationId : null;
  const shared = useSharedTable(dataSource, tableId, shareHint);
  /** A table shared with her from outside and not yet opened says so, rather than "not given". */
  const pendingInvitation = usePendingTableInvitation(tableId, object.state === "not-given");
  const knownOrganizationName =
    object.state === "found"
      ? (myOrganizations.find((o) => o.id === object.organizationId)?.name ??
        (shared.state === "shared" ? shared.organizationName : null))
      : null;
  /** The organization this table reads as: the TABLE'S. */
  const readingOrganizationId: string | null = object.state === "found" ? object.organizationId : null;
  const readingState: OrganizationState = readingOrganizationId ? "ready" : "resolving";
  /** She reads it as a member of its organization — known once the share door said it is not an outsider's. */
  const readsAsMember = shared.state === "none";
  // A shared viewer reads no organization's settings (lane HANDOVER): an outsider gets the platform's value.
  const knobMergedGrid = useMergedGridKnob(readsAsMember ? readingOrganizationId : null);
  const mergedGrid = address.gridForced || knobMergedGrid;
  /** The ports records-ui asks this app for — the ONE host binding every record-store table shares. */
  const ports = useRecordsUiPorts({ organizationId: readingOrganizationId, dataSource, readsAsMember });

  /** TABLE-PARITY N2, in the table's one menu: absent until the store says a row change reaches a schedule. */
  const rowChangeOffer = useRowChangeAgentOffer({
    tableId,
    tableName: null,
    organizationId: object.state === "found" ? object.organizationId : null,
    userId: userId ?? null,
  });
  /** Where this table lives (records-ui's `WhereItLives`, with Move), and the share level for an outsider. */
  const whereItLives =
    object.state === "found" ? (
      <span className="flex min-w-0 flex-col gap-1" data-table-lives-in="">
        <WhereItLives
          tableId={tableId}
          knownOrganizationName={knownOrganizationName}
          onMoved={() => object.retry()}
          variant="row"
        />
        {shared.state === "shared" ? (
          <span className="text-muted-foreground">Shared with you &middot; {shared.levelLabel}</span>
        ) : null}
      </span>
    ) : null;
  const allTablesHref = readingOrganizationId
    ? `/data?org=${encodeURIComponent(readingOrganizationId)}`
    : "/data";

  /** The table's favorite — the Data home's own star (`useTableFavorite`). */
  const favorite = useTableFavorite(tableId, object.state === "found" ? object.organizationId : null);
  /**
   * THE APP'S PART OF THE TABLE'S ONE ACTION LIST (lane TABLE-ACTIONS): favorite, the page origin
   * for Copy link, a re-read after Move, and this app's own entries (`tableMenuExtensions`: Workflows
   * and the row-change agent) — always listed, disabled with a
   * reason where they do not apply. Duplicate is left unbound until its store door is live, so it
   * says "Not available here".
   */
  /** ⌘K finds this table's actions (the same list the header ⋯ draws; TABLE-ACTIONS T4.1). */
  const onActions = useTablePageCommands(null);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const actionHost: TablePageActionHost = {
    ...(typeof window !== "undefined" ? { origin: window.location.origin } : {}),
    ...(favorite.known ? { isFavorite: favorite.isFavorite, toggleFavorite: favorite.toggle } : {}),
    onMoved: () => object.retry(),
    extend: () => [
      ...tableMenuExtensions({
        // WORKFLOWS ON THIS TABLE (lane 11 wave 2): the simple builder.
        workflows: () => router.push(`/workflows/builder/${tableId}`),
        // AUTOMATIONS ON THIS TABLE: the same panel Spaces' databases carry, one click from the ⋯ menu.
        automations: () => setAutomationsOpen(true),
        ...(rowChangeOffer.state === "offered"
          ? { rowChangeAgent: () => router.push((rowChangeOffer as { href: string }).href) }
          : rowChangeOffer.state === "refused"
            ? {
                rowChangeAgent: () =>
                  toast.error("Running an agent when a row changes is not available", {
                    description: (rowChangeOffer as { why: string }).why,
                  }),
              }
            : {}),
      }),
      ...(actionExtensions ?? []),
    ],
  };

  /** Why the table did not open, in one sentence (for a capture), or null when it did. */
  const says: string | null =
    object.state === "resolving" || (object.state === "not-given" && pendingInvitation === undefined)
      ? "Opening the table…"
      : object.state === "not-given" && pendingInvitation
        ? "A pending invitation to this table is shown."
        : object.state === "not-given"
          ? "You have not been given this table."
          : object.state === "unavailable"
            ? `We could not find out where this table is. ${object.why}`
            : null;

  /** The table itself is on screen (the store answered). */
  const mountsTheTable =
    object.state !== "resolving" &&
    object.state !== "not-given" &&
    object.state !== "unavailable";

  /**
   * THE MOUNT'S CONFIG AND HOST, EACH ITS OWN VALUE (lane RENDER-AUDIT): as their own statements
   * each is rebuilt only when what it is made of changes. Null until the table can mount.
   */
  /** The organization the mount reads as, once the table can mount. */
  const mountOrganizationId = mountsTheTable ? readingOrganizationId : null;
  // LIVE UPDATES + data seam + actor: the app's ONE records config.
  const appRecordsConfig = useAppRecordsConfig(mountOrganizationId);
  const recordsConfig: RecordsMountProps["config"] | null = mountOrganizationId ? appRecordsConfig : null;
  const recordsHost: RecordsMountProps["host"] | null = mountOrganizationId
    ? recordsUiHostFor({
        ports,
        merged: mergedGrid,
        gridContext,
        ...(readOnly ? { rights: PREVIEW_RIGHTS } : {}),
      })
    : null;

  return {
    tableId,
    address,
    object,
    shared,
    pendingInvitation,
    knownOrganizationName,
    readingOrganizationId,
    mergedGrid,
    gridContext,
    whereItLives,
    allTablesHref,
    actionHost,
    automationsOpen,
    setAutomationsOpen,
    onActions,
    says,
    mountsTheTable,
    recordsConfig,
    recordsHost,
  };
}

export type UnifiedTableMount = ReturnType<typeof useUnifiedTable>;

/**
 * Every state of the table, and — when it opens — the table page itself, under the
 * `matrx-user/data-tables` surface. `before` is drawn inside the mount above the table page (the
 * route's fallback header and capture); `header` is `TablePage.header` (the route's header with
 * the table's own Share and menu). Left out, `TablePage` keeps Share and its menu in its own row.
 */
export function UnifiedTableBody({
  mount,
  before,
  header,
  onLeave,
  onViewChanged,
  onShownViewChange,
  viewAddress,
  onViewAddressChange,
  content,
  skeleton,
}: {
  mount: UnifiedTableMount;
  before?: ReactNode;
  content?: ReactNode;
  /** What stands in while the table is found — default the table page's own skeleton. A host whose
   * `content` is not a table (the record page) passes the skeleton of what it draws. */
  skeleton?: ReactNode;
  header?: (chrome: { actions: ReactNode }) => ReactNode;
  onLeave?: () => void;
  onViewChanged?: (view: PageView | string) => void;
  onShownViewChange?: (shown: ShownViewLike) => void;
  /** The view in the address bar (FTS-5): what the address said on arrival, and where changes are written. */
  viewAddress?: ViewAddressState | null;
  onViewAddressChange?: (state: ViewAddressState | null) => void;
}) {
  const router = useRouter();
  const { tableId, address, object, shared, pendingInvitation } = mount;
  // Passed as named objects: `onShownViewChange` and `header` ride newer records-ui builds; an
  // installed build without them ignores the key.
  const shownViewReport: { onShownViewChange?: (shown: ShownViewLike) => void } = onShownViewChange
    ? { onShownViewChange }
    : {};
  const viewInAddress: { viewAddress?: ViewAddressState | null; onViewAddressChange?: (state: ViewAddressState | null) => void } = {
    ...(onViewAddressChange ? { onViewAddressChange } : {}),
    ...(viewAddress !== undefined ? { viewAddress } : {}),
  };
  const loadingFrame = skeleton ?? <TablePageSkeleton layout={skeletonLayoutFor(address.view)} />;
  const pageHeader: { header?: (chrome: { actions: ReactNode }) => ReactNode } = header ? { header } : {};
  const mountedTable = !mount.mountsTheTable ? null : content !== undefined ? (
    <>
      {before}
      {content}
    </>
  ) : (
    <>
      {before}
      <RecordStoreTableSurface channel={mount.gridContext} enabled={mount.mergedGrid} tableId={tableId}>
        <TablePage
          tableId={tableId}
          onLeave={onLeave}
          activeDashboardId={address.dashboard}
          activeRecordId={address.record}
          activeView={address.view}
          activeGroupField={address.group}
          {...shownViewReport}
          {...viewInAddress}
          cameFrom={address.from}
          filter={address.filter}
          onViewChanged={onViewChanged}
          activeRail={address.rail}
          activeItemId={address.item}
          actionHost={mount.actionHost}
          onActions={mount.onActions}
          {...pageHeader}
        />
      </RecordStoreTableSurface>
      {mount.automationsOpen ? (
        <TableAutomationsDialog
          tableId={tableId}
          organizationId={mount.object.state === "found" ? mount.object.organizationId : null}
          open={mount.automationsOpen}
          onOpenChange={mount.setAutomationsOpen}
        />
      ) : null}
    </>
  );

  // The table page's own skeleton at its final geometry — never a line of text that a grey box
  // and then the page replace (lane STABLE-TABLES, Arman 2026-10-06).
  if (object.state === "resolving" || (object.state === "not-given" && pendingInvitation === undefined)) {
    return <>{loadingFrame}</>;
  }
  if (object.state === "not-given" && pendingInvitation) {
    return <PendingTableInvitation invitation={pendingInvitation} />;
  }
  if (object.state === "not-given") {
    /* THE CANONICAL NO ACCESS PAGE: a Table is a record of the store (token `record`). */
    return (
      <AccessGate
        token="record"
        id={tableId}
        onRetry={object.retry}
        fallbackHref="/data"
        fallbackLabel="Back to your tables"
        footer={<TableTransferOffer tableId={tableId} onTransferred={object.retry} />}
      />
    );
  }
  if (object.state === "unavailable") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
        <p className="text-sm font-medium">We could not find out where this table is <ErrorAlchemyMenu /></p>
        <p className="max-w-prose text-xs text-muted-foreground">
          The record store did not answer, so nothing was opened. This is not an answer about
          your access. {object.why}
        </p>
        <Button size="sm" variant="outline" onClick={object.retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!mount.recordsConfig) {
    return <>{loadingFrame}</>;
  }
  return (
    // The table page's right-click is the proposed menu (`DataMenuProvider`); its ⋯ is the action list.
    <DataMenuProvider>
      <RecordsMount letTheStoreDecideRights config={mount.recordsConfig} host={mount.recordsHost ?? undefined}>
        {mountedTable}
      </RecordsMount>
    </DataMenuProvider>
  );
}
