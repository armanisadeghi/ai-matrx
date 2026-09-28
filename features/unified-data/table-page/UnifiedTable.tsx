"use client";

/**
 * ONE RECORD-STORE TABLE, MOUNTED — the part of `/data-v2/[tableId]` that is not route chrome.
 *
 * `/data-v2/[tableId]` and a Board tile (`features/spatial/items/data-items.tsx`) render the SAME
 * table page: records-ui's `TablePage` inside `RecordsMount`, reading as the TABLE's organization,
 * with the same ports, realtime, Sheet layout, merged-grid knob, table-menu extras and
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

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RecordsMount, TablePage, WhereItLives, personActor, recordsDataSource } from "@ai-matrx/records-ui";
import type { PageView, RecordsMountProps } from "@ai-matrx/records-ui";
import type { RecordFilter } from "@ai-matrx/records";
import { Button } from "@ai-matrx/design-system";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { TableTransferOffer } from "@/features/sharing/components/TableTransferOffer";
import {
  PendingTableInvitation,
  usePendingTableInvitation,
} from "@/features/sharing/outside/PendingTableInvitation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import { useSharedTable } from "@/features/unified-data/hub/useSharedTable";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { SheetLayout } from "@/features/data-tables/components/SheetLayout";
import { recordsUiHostFor, useRecordsUiPorts } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useMergedGridKnob } from "@/features/data-tables/records-ui-host/mergedGridKnob";
import { toast } from "@/lib/toast";
import { copyAgain } from "@/features/unified-data/cutover/copyAgain";
import {
  ROW_CHANGE_AGENT_LABEL,
  useRowChangeAgentOffer,
} from "@/features/unified-data/row-change-agent/RowChangeAgentLink";
import { tableCopyEvaluation, useTableCopyEvaluation } from "@/features/unified-data/tableCopyEvaluation";
import { RecordStoreTableSurface, useGridContextChannel } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import type { ShownViewLike } from "@/features/unified-data/page-capture/shownViewCapture";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * WHAT THE PAGE IS ASKED TO OPEN ON — the route reads it from its address (`?view=`, `?record=`,
 * `?dashboard=`, `?rail=&item=`, `?group=`, `?from=`, `?filter=`, `?grid=merged`, `?org=`); a
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
  /** `?org=` — only consulted while `custom.where_id_opens` is absent (the stand-in). */
  askedOrganizationId: string | null;
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
  askedOrganizationId: null,
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

export function useUnifiedTable({ tableId, address }: { tableId: string; address: TableAddress }) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  /** THE AGENT'S VIEW OF THE MERGED GRID (merge 6l): the grid tells the channel, the surface reads it. */
  const gridContext = useGridContextChannel();
  /** THE ONE DATA SEAM, built once. */
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  /**
   * WHOSE TABLE THIS IS, ASKED OF THE TABLE — ACCESS IS PERSONAL (owner, 2026-09-23). The page
   * asks `custom.where_id_opens(<table>)` — the organization the table lives in, answered only
   * when this person may open it — and reads as THAT. The active organization is never read here
   * (`pnpm check:object-pages-read-the-objects-organization`).
   */
  const object = useObjectOrganization(dataSource, tableId);
  const { organizations: myOrganizations } = useUserOrganizations();
  /** A table another organization gave this person (see `useSharedTable`). */
  const shareHint =
    object.state === "found"
      ? object.organizationId
      : object.state === "stand-in"
        ? address.askedOrganizationId
        : null;
  const shared = useSharedTable(
    dataSource,
    tableId,
    shareHint,
    object.state === "stand-in" ? object.activeOrganizationId : null,
  );
  /** A table shared with her from outside and not yet opened says so, rather than "not given". */
  const pendingInvitation = usePendingTableInvitation(tableId, object.state === "not-given");
  const knownOrganizationName =
    object.state === "found"
      ? (myOrganizations.find((o) => o.id === object.organizationId)?.name ??
        (shared.state === "shared" ? shared.organizationName : null))
      : null;
  /** The organization this table reads as: the TABLE'S. */
  const readingOrganizationId: string | null =
    object.state === "found"
      ? object.organizationId
      : object.state === "stand-in"
        ? shared.state === "shared"
          ? shared.organizationId
          : object.activeOrganizationId
        : null;
  const readingState: OrganizationState =
    object.state === "stand-in" ? object.organizationState : readingOrganizationId ? "ready" : "resolving";
  /** She reads it as a member of its organization — known once the share door said it is not an outsider's. */
  const readsAsMember = shared.state === "none";
  // A shared viewer reads no organization's settings (lane HANDOVER): an outsider gets the platform's value.
  const knobMergedGrid = useMergedGridKnob(readsAsMember ? readingOrganizationId : null);
  const mergedGrid = address.gridForced || knobMergedGrid;
  // ONE SWITCH: does THIS organization keep its data in the record store (lane NAV-FIX).
  const campaign = useUnifiedDataCampaign({
    organizationId: readingOrganizationId,
    organizationState: readingState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });
  /** The ports records-ui asks this app for — the ONE host binding every record-store table shares. */
  const ports = useRecordsUiPorts({ organizationId: readingOrganizationId, dataSource, readsAsMember });

  /** TABLE-PARITY N2, in the table's one menu: absent until the store says a row change reaches a schedule. */
  const rowChangeOffer = useRowChangeAgentOffer({
    tableId,
    tableName: null,
    organizationId: campaign.state === "on" && object.state === "found" ? object.organizationId : null,
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
    ? `/data-v2?org=${encodeURIComponent(readingOrganizationId)}`
    : "/data-v2";

  /** A TEST COPY SAYS SO IN THE TABLE MENU, NOT IN A BANNER (lane COPY-WRITABLE). */
  const [copyVersion, setCopyVersion] = useState(0);
  const copyEvaluation = useTableCopyEvaluation(object.state === "found" ? tableId : null, copyVersion);
  const dispatchCopy = useAppDispatch();
  /** "Copy this table again" (lane COPY-AGAIN-DOOR): the mover's rerun for this one table. */
  const copyThisTableAgain = () => {
    const id = toast.loading("Copying this table again from the older table…");
    void copyAgain(
      dispatchCopy,
      { tableId, ...(object.state === "found" ? { organizationId: object.organizationId } : {}) },
      (p) => toast.loading(p.says, { id }),
    ).then((answer) => {
      if (answer.ok) toast.success(answer.says, { id });
      else toast.error("This table was not copied again", { id, description: answer.says });
      setCopyVersion((v) => v + 1);
    });
  };
  const testCopyExtras =
    copyEvaluation.state === "test-copy"
      ? [
          {
            key: "test-copy",
            label: copyEvaluation.says,
            onSelect: () => {
              void tableCopyEvaluation(createClient(), tableId).then((now) => {
                const said = now.state === "test-copy" ? now : copyEvaluation;
                toast.info(said.says, {
                  description: said.detail,
                  ...(object.state === "found"
                    ? {
                        action: {
                          label: "Data switch",
                          onClick: () => router.push(`/organizations/${object.organizationId}/settings#data`),
                        },
                      }
                    : {}),
                });
              });
            },
          },
          { key: "copy-again", label: "Copy this table again", onSelect: copyThisTableAgain },
        ]
      : [];
  const rowChangeExtras =
    rowChangeOffer.state === "offered"
      ? [
          {
            key: "row-change-agent",
            label: ROW_CHANGE_AGENT_LABEL,
            onSelect: () => router.push((rowChangeOffer as { href: string }).href),
          },
        ]
      : rowChangeOffer.state === "refused"
        ? [
            {
              key: "row-change-agent",
              label: ROW_CHANGE_AGENT_LABEL,
              onSelect: () =>
                toast.error("Running an agent when a row changes is not available", {
                  description: (rowChangeOffer as { why: string }).why,
                }),
            },
          ]
        : [];
  const menuExtras = [...testCopyExtras, ...rowChangeExtras];

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
            : object.state === "stand-in" && shared.state === "not-shared"
              ? `This shared table cannot open right now. ${shared.why}`
              : campaign.state !== "on"
                ? `The record store is not on for this organization (${campaign.state}).`
                : null;

  /** The table itself is on screen (the store answered, the switch is on). */
  const mountsTheTable =
    object.state !== "resolving" &&
    object.state !== "not-given" &&
    object.state !== "unavailable" &&
    !(object.state === "stand-in" && (object.organizationState !== "ready" || shared.state !== "shared" && shared.state !== "none")) &&
    campaign.state === "on";

  /**
   * THE MOUNT'S CONFIG AND HOST, EACH ITS OWN VALUE (lane RENDER-AUDIT): as their own statements
   * each is rebuilt only when what it is made of changes. Null until the table can mount.
   */
  /** The organization the mount reads as, once the table can mount. */
  const mountOrganizationId = mountsTheTable ? readingOrganizationId : null;
  const recordsConfig: RecordsMountProps["config"] | null = mountOrganizationId
    ? {
        dataSource,
        actor: personActor(userId),
        organizationId: mountOrganizationId,
        // LIVE UPDATES: the private topic the database broadcasts a NOTICE on.
        realtime: createRecordsRealtimePort(mountOrganizationId),
      }
    : null;
  const recordsHost: RecordsMountProps["host"] | null = mountOrganizationId
    ? recordsUiHostFor({
        ports,
        merged: mergedGrid,
        gridContext,
        // THE SHEET — the classic /data grid on the one data seam, the fifth layout (owner, 2026-09-23).
        layouts: [
          {
            id: "sheet",
            label: "Sheet",
            render: (args) => (
              <SheetLayout
                tableId={args.tableId}
                organizationId={mountOrganizationId}
                userId={userId ?? null}
                openExport={(args as { openExport?: () => void }).openExport}
                {...((args as { toolbarSlot?: HTMLElement | null }).toolbarSlot !== undefined
                  ? { toolbarSlot: (args as { toolbarSlot?: HTMLElement | null }).toolbarSlot }
                  : {})}
                {...((args as { footer?: "sticky" | "inline" }).footer
                  ? { footer: (args as { footer?: "sticky" | "inline" }).footer }
                  : {})}
              />
            ),
          },
        ],
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
    campaign,
    mergedGrid,
    gridContext,
    whereItLives,
    allTablesHref,
    menuExtras,
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
  content,
}: {
  mount: UnifiedTableMount;
  before?: ReactNode;
  content?: ReactNode;
  header?: (chrome: { actions: ReactNode }) => ReactNode;
  onLeave?: () => void;
  onViewChanged?: (view: PageView | string) => void;
  onShownViewChange?: (shown: ShownViewLike) => void;
}) {
  const router = useRouter();
  const { tableId, address, object, shared, pendingInvitation, campaign } = mount;
  // Passed as named objects: `onShownViewChange` and `header` ride newer records-ui builds; an
  // installed build without them ignores the key.
  const shownViewReport: { onShownViewChange?: (shown: ShownViewLike) => void } = onShownViewChange
    ? { onShownViewChange }
    : {};
  const pageHeader: { header?: (chrome: { actions: ReactNode }) => ReactNode } = header ? { header } : {};
  const mountedTable = !mount.mountsTheTable ? null : content !== undefined ? (
    <>
      {before}
      {content}
    </>
  ) : (
    <>
      {before}
      <RecordStoreTableSurface channel={mount.gridContext} enabled={mount.mergedGrid}>
        <TablePage
          tableId={tableId}
          onLeave={onLeave}
          activeDashboardId={address.dashboard}
          activeRecordId={address.record}
          activeView={address.view}
          activeGroupField={address.group}
          {...shownViewReport}
          cameFrom={address.from}
          filter={address.filter}
          onViewChanged={onViewChanged}
          activeRail={address.rail}
          activeItemId={address.item}
          menuExtras={mount.menuExtras}
          {...pageHeader}
        />
      </RecordStoreTableSurface>
    </>
  );

  if (object.state === "resolving" || (object.state === "not-given" && pendingInvitation === undefined)) {
    return <p className="text-sm text-muted-foreground">Opening the table&hellip;</p>;
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
        fallbackHref="/data-v2"
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
  if (object.state === "stand-in" && object.organizationState !== "ready") {
    return <OrganizationContextNotice state={object.organizationState} what="Data records" />;
  }
  if (object.state === "stand-in" && shared.state === "checking") {
    return <p className="text-sm text-muted-foreground">Opening the table&hellip;</p>;
  }
  if (object.state === "stand-in" && shared.state === "not-shared") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
        <p className="text-sm font-medium">This shared table cannot open right now</p>
        <p className="max-w-prose text-xs text-muted-foreground">{shared.why}</p>
        <Button size="sm" variant="outline" onClick={() => router.push("/data-v2")}>
          Back to your tables
        </Button>
      </div>
    );
  }
  if (campaign.state !== "on" || !mount.recordsConfig) {
    return <UnifiedDataSwitchNotice gate={campaign} what="Data records" />;
  }
  return (
    <RecordsMount letTheStoreDecideRights config={mount.recordsConfig} host={mount.recordsHost ?? undefined}>
      {mountedTable}
    </RecordsMount>
  );
}
