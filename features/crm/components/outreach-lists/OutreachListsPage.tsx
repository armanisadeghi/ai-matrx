"use client";

// features/crm/components/outreach-lists/OutreachListsPage.tsx
//
// /crm/outreach-lists — the outreach list console: every outreach list the user can work
// (mine + my orgs), dense table-first, with create. Outreach list counts are small
// (an org runs dozens, not thousands), so the table runs in local mode —
// sort/filter over the loaded set.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ListChecks,
  Megaphone,
  MoreVertical,
  Plus,
} from "lucide-react";
import { dismissRecordToasts, recordToast, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ItemMenu } from "@ai-matrx/design-system/item";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { outreachListMenuTarget, useCrmRowMenu } from "../crm-row-actions";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { formatRelativeTime } from "@/utils/datetime";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import {
  CRM_OUTREACH_LISTS_SURFACE_NAME,
  createCrmOutreachListsScope,
} from "@/features/surfaces/manifests/crm-outreach-lists.manifest";
import { useCrmContext } from "../../hooks/useCrmContext";
import {
  deleteOutreachList,
  fetchOutreachLists,
  setOutreachListStatus,
} from "../../outreach-lists/service";
import type {
  OutreachListWithCount,
  OutreachListStatus,
} from "../../outreach-lists/types";
import { LIST_STATUSES } from "../../outreach-lists/types";
import { ListKindBadge, ListStatusBadge } from "./badges";
import { OutreachListCreateDialog } from "./OutreachListCreateDialog";
import { OrgOutreachReportPanel } from "../../analytics/OrgOutreachReportPanel";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { useRead } from "@ai-matrx/design-system";
import { ReadFailure } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { ActivateOutreachListDialog } from "@/features/crm/pitch-advisories/ActivateOutreachListDialog";
import { MediaResearchDialog } from "@/features/crm/media-research/MediaResearchDialog";

function memberCount(row: OutreachListWithCount): number {
  return row.members?.[0]?.count ?? 0;
}

export function OutreachListsPage() {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useCrmContext();
  // ?view=report is the org-wide reporting layer over every campaign below.
  const [activeView, setActiveView] = useState<"lists" | "report">(
    searchParams.get("view") === "report" ? "report" : "lists",
  );
  const [createOpen, setCreateOpen] = useState(false);
  // Activating a campaign IS its send step: the cadence starts mailing. The PR
  // floor's list checks (E1–E5, E10, E17) show first; Activate stays live.
  const [activating, setActivating] = useState<OutreachListWithCount | null>(
    null,
  );
  // Media-list research (Brief 3): preview → Run it → streamed → lands on the list.
  const [researching, setResearching] = useState<OutreachListWithCount | null>(
    null,
  );

  // ONE read with a status (RC-B12 r13): a failed read is never "No outreach
  // lists yet" — the table renders only after a read that succeeded; a failed
  // refresh keeps the rows with an honest notice.
  const listsRead = useRead(
    () => (ctx ? fetchOutreachLists(ctx) : Promise.resolve([])),
    [ctx],
    { enabled: ctx != null },
  );
  const rows: OutreachListWithCount[] = listsRead.data ?? [];
  const setRows = listsRead.setData;
  const load = listsRead.retry;
  const isLoading = listsRead.isLoading;
  const error = listsRead.isError
    ? listsRead.error instanceof Error
      ? listsRead.error.message
      : String(listsRead.error)
    : null;
  const readFailedWithNoRows = listsRead.isError && listsRead.data === undefined;

  const columns: MatrxColumnDef<OutreachListWithCount>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Outreach list",
      sortable: true,
      filter: "text",
      href: (row) => `/crm/outreach-lists/${row.id}`,
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {row.name}
          </span>
          {row.description && (
            <span className="truncate text-[11px] text-muted-foreground">
              {row.description}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "list_kind",
      accessorKey: "list_kind",
      header: "Kind",
      sortable: true,
      filter: "select",
      filterOptions: [
        { value: "call", label: "Calling" },
        { value: "email", label: "Email" },
        { value: "list", label: "List" },
        { value: "mixed", label: "Mixed" },
      ],
      width: 100,
      cell: (row) => <ListKindBadge kind={row.list_kind} />,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      sortable: true,
      filter: "select",
      filterOptions: LIST_STATUSES.map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
      width: 110,
      cell: (row) => <ListStatusBadge status={row.status} />,
    },
    {
      id: "members",
      accessorFn: (row) => memberCount(row),
      header: "Members",
      sortable: true,
      filter: false,
      align: "right",
      width: 90,
      cell: (row) => (
        <span className="text-xs tabular-nums text-foreground">
          {memberCount(row).toLocaleString()}
        </span>
      ),
    },
    {
      id: "started_at",
      accessorKey: "started_at",
      header: "Started",
      sortable: true,
      filter: false,
      width: 110,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {row.started_at ? formatRelativeTime(row.started_at) : "—"}
        </span>
      ),
    },
    {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      sortable: true,
      filter: false,
      width: 110,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {formatRelativeTime(row.updated_at)}
        </span>
      ),
    },
  ];

  const menuFor =
    (row: OutreachListWithCount): (() => ItemMenuConfig) =>
    () => ({
      sections: [
        {
          id: "open",
          items: [
            {
              id: "open",
              kind: "link",
              label: "Open",
              href: `/crm/outreach-lists/${row.id}`,
            },
            {
              id: "dial",
              kind: "link",
              label: "Open call queue",
              href: `/crm/outreach-lists/${row.id}/dial`,
            },
            {
              id: "find-journalists",
              label: "Find journalists for this angle",
              onSelect: () => setResearching(row),
            },
            {
              id: "copy-link",
              label: "Copy link",
              onSelect: async () => {
                await copyText(
                  `${window.location.origin}/crm/outreach-lists/${row.id}`,
                );
              },
            },
          ],
        },
        {
          id: "lifecycle",
          items: (row.status === "active"
            ? [
                { next: "paused" as OutreachListStatus, label: "Pause" },
                {
                  next: "completed" as OutreachListStatus,
                  label: "Mark completed",
                },
              ]
            : row.status === "draft" || row.status === "paused"
              ? [{ next: "active" as OutreachListStatus, label: "Activate" }]
              : [{ next: "archived" as OutreachListStatus, label: "Archive" }]
          ).map(({ next, label }) => ({
            id: `status-${next}`,
            label,
            onSelect: async () => {
              if (next === "active") {
                setActivating(row);
                return;
              }
              try {
                await setOutreachListStatus(row, next);
                load();
                recordToast.success(
                  { type: "crm-outreach-list", id: row.id, title: row.name },
                  `${row.name} → ${next}`,
                );
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Update failed");
              }
            },
          })),
        },
        {
          id: "danger",
          items: [
            {
              id: "delete",
              label: "Delete",
              tone: "destructive" as const,
              onSelect: async () => {
                const ok = await confirm({
                  title: `Delete ${row.name}?`,
                  description:
                    "The outreach list moves to trash. Members and logged calls are kept.",
                  confirmLabel: "Delete",
                  variant: "destructive" as const,
                });
                if (!ok) return;
                try {
                  await deleteOutreachList(row.id);
                  dismissRecordToasts({
                    type: "crm-outreach-list",
                    id: row.id,
                  });
                  setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
                  toast.success(`${row.name} deleted`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              },
            },
          ],
        },
      ],
    });

  /**
   * The surface's live scope — ONE builder for BOTH the Agents chrome and the
   * right-click menu, so a menu-launched agent receives every value
   * `crm-outreach-lists.manifest.ts` declares (v3 screams otherwise).
   */
  const getScope = () =>
    createCrmOutreachListsScope({
      visible_lists: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        list_kind: row.list_kind,
        status: row.status,
        member_count: memberCount(row),
        started_at: row.started_at,
        updated_at: row.updated_at,
      })),
      visible_list_ids: rows.map((row) => row.id),
      list_count: rows.length,
      available_organizations: ctx
        ? Object.entries(ctx.orgNames).map(([id, name]) => ({ id, name }))
        : undefined,
      is_loading: isLoading || !ctx,
      load_error: error ?? undefined,
    });

  // ONE menu for the pane; the clicked row's own "…" verbs (lifecycle,
  // delete) ride in from the SAME `menuFor` config the button uses.
  const rowMenu = useCrmRowMenu<OutreachListWithCount>({
    rows: () => rows,
    toTarget: outreachListMenuTarget,
    getSurfaceScope: getScope,
    rowMenu: menuFor,
  });

  const newButton = (
    <Button
      icon={<Plus />}
      variant="primary"
      onClick={() => setCreateOpen(true)}
    >
      New outreach list
    </Button>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={CRM_OUTREACH_LISTS_SURFACE_NAME}
      getScope={getScope}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Outreach lists you created or that live in your organizations.
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                icon={activeView === "report" ? (
                  <ListChecks />
                ) : (
                  <BarChart3 />
                )}
                variant={activeView === "report" ? "outline" : "quiet"}
                onClick={() =>
                  setActiveView(activeView === "report" ? "lists" : "report")
                }
              >
                {activeView === "report" ? "Lists" : "Report"}
              </Button>
              {newButton}
            </div>
          </div>
          {listsRead.isError && !readFailedWithNoRows && (
            <StaleDataNotice
              hasData
              what="your outreach lists"
              detail={error}
              onRetry={load}
              className="mt-2"
            />
          )}
          {ctx?.orgMembershipsUnread && (
            <StaleDataNotice
              hasData
              partial
              what="your organizations' outreach lists"
              onRetry={() => ctx.retryOrgMemberships?.()}
              className="mt-2"
            />
          )}
          {/* Outreach assists (producers write platform.assists rows keyed to
            this surface; the strip renders nothing while none are pending). */}
          <AssistStrip
            surfaceName={CRM_OUTREACH_LISTS_SURFACE_NAME}
            className="mt-2"
          />
        </div>

        {activeView === "report" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-2">
            {/* One org's outreach, rolled up from the SAME pure functions the
              per-campaign panel uses — the totals and the rows cannot drift. */}
            {ctx ? (
              <OrgOutreachReportPanel ctx={ctx} />
            ) : (
              <LoadingSurface label="Loading your campaigns…" />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
            {/* rowMenu.resolveContextOnOpen (useCrmRowMenu, crm-row-actions.tsx)
                returns the reserved CONTEXT_MENU_ENTITY_KEY per clicked row, so
                Attach To / Share target the exact outreach list, not the pane. */}
            <NonEditableContextMenu
              sourceFeature="crm"
              surfaceName={CRM_OUTREACH_LISTS_SURFACE_NAME}
              contentSource={{ type: "raw" }}
              getApplicationScope={rowMenu.getApplicationScope}
              resolveContextOnOpen={rowMenu.resolveContextOnOpen}
              extraSections={rowMenu.sections}
            >
              <div className="flex h-full min-h-0 flex-col">
                {readFailedWithNoRows ? (
                  <ReadFailure
                    error={listsRead.error}
                    what="your outreach lists"
                    onRetry={load}
                  />
                ) : (
                <MatrxDataTable<OutreachListWithCount>
                  data={rows}
                  columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (row) => (
                    <ItemMenu config={menuFor(row)} align="end">
                      <button
                        type="button"
                        aria-label={`Actions for ${row.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </ItemMenu>
                  ) }]}
                  getRowId={(row) => row.id}
                  isLoading={isLoading || !ctx}
                  zebra
                  detail={{ enabled: false }}
                  window={{ enabled: false }}
                  getRowHref={(row) => `/crm/outreach-lists/${row.id}`}
                  onRowOpen={(row) =>
                    router.push(`/crm/outreach-lists/${row.id}`)
                  }
                  toolbar={{
                    search: true,
                    searchPlaceholder: "Search outreach lists…",
                  }}

                  copy={{
                    label: "Outreach list",
                    listLabel: "Outreach Lists",
                    location: "/crm/outreach-lists",
                    rowKind: "crm-outreach-list",
                    listKind: "crm-outreach-lists",
                    humanRow: (row) =>
                      `${row.name} (${row.list_kind}, ${row.status}) — ${memberCount(row)} members`,
                    showRow: false,
                    showToolbar: false,
                  }}
                  emptyState={{
                    icon: <Megaphone className="h-5 w-5" />,
                    title: "No outreach lists yet",
                    description:
                      "Create one, then add members from the CRM list or from a saved filter — and power-dial it from the call queue.",
                    action: newButton,
                  }}
                />
                )}
              </div>
            </NonEditableContextMenu>
          </div>
        )}

        <ActivateOutreachListDialog
          list={activating}
          onOpenChange={(open) => {
            if (!open) setActivating(null);
          }}
          onActivated={(list) => {
            load();
            recordToast.success(
              { type: "crm-outreach-list", id: list.id, title: list.name },
              `${list.name} → active`,
            );
          }}
        />

        {researching && (
          <MediaResearchDialog
            open
            onOpenChange={(open) => {
              if (!open) setResearching(null);
            }}
            listId={researching.id}
            listName={researching.name}
            organizationId={researching.organization_id}
            onLanded={load}
          />
        )}

        <OutreachListCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(list) => {
            recordToast.success(
              { type: "crm-outreach-list", id: list.id, title: list.name },
              `${list.name} created`,
            );
            router.push(`/crm/outreach-lists/${list.id}`);
          }}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
