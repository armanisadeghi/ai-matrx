"use client";

// features/crm/components/campaigns/CampaignListPage.tsx
//
// /crm/campaigns — the campaign console: every campaign the user can work
// (mine + my orgs), dense table-first, with create. Campaign counts are small
// (an org runs dozens, not thousands), so the table runs in local mode —
// sort/filter over the loaded set.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, MoreVertical, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { formatRelativeTime } from "@/utils/datetime";
import { useCrmContext } from "../../hooks/useCrmContext";
import {
  deleteCampaign,
  fetchCampaigns,
  setCampaignStatus,
} from "../../campaigns/service";
import type { CampaignListRow, CampaignStatus } from "../../campaigns/types";
import { CAMPAIGN_STATUSES } from "../../campaigns/types";
import {
  CampaignKindBadge,
  CampaignStatusBadge,
} from "./badges";
import { CampaignCreateDialog } from "./CampaignCreateDialog";

function memberCount(row: CampaignListRow): number {
  return row.members?.[0]?.count ?? 0;
}

export function CampaignListPage() {
  const router = useRouter();
  const ctx = useCrmContext();
  const [rows, setRows] = useState<CampaignListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ctx) return;
    try {
      setError(null);
      setRows(await fetchCampaigns(ctx));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: MatrxColumnDef<CampaignListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Campaign",
      sortable: true,
      filter: "text",
      href: (row) => `/crm/campaigns/${row.id}`,
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
      id: "campaign_kind",
      accessorKey: "campaign_kind",
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
      cell: (row) => <CampaignKindBadge kind={row.campaign_kind} />,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      sortable: true,
      filter: "select",
      filterOptions: CAMPAIGN_STATUSES.map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
      width: 110,
      cell: (row) => <CampaignStatusBadge status={row.status} />,
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

  const menuFor = (row: CampaignListRow): (() => ItemMenuConfig) => () => ({
    sections: [
      {
        id: "open",
        items: [
          {
            id: "open",
            kind: "link",
            label: "Open",
            href: `/crm/campaigns/${row.id}`,
          },
          {
            id: "dial",
            kind: "link",
            label: "Open call queue",
            href: `/crm/campaigns/${row.id}/dial`,
          },
          {
            id: "copy-link",
            label: "Copy link",
            onSelect: () =>
              navigator.clipboard.writeText(
                `${window.location.origin}/crm/campaigns/${row.id}`,
              ),
            toast: { loading: "Copying…", success: "Link copied" },
          },
        ],
      },
      {
        id: "lifecycle",
        items: (row.status === "active"
          ? [
              { next: "paused" as CampaignStatus, label: "Pause" },
              { next: "completed" as CampaignStatus, label: "Mark completed" },
            ]
          : row.status === "draft" || row.status === "paused"
            ? [{ next: "active" as CampaignStatus, label: "Activate" }]
            : [{ next: "archived" as CampaignStatus, label: "Archive" }]
        ).map(({ next, label }) => ({
          id: `status-${next}`,
          label,
          onSelect: async () => {
            try {
              await setCampaignStatus(row, next);
              await load();
              toast.success(`${row.name} → ${next}`);
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
                  "The campaign moves to trash. Members and logged calls are kept.",
                confirmLabel: "Delete",
                variant: "destructive",
              });
              if (!ok) return;
              try {
                await deleteCampaign(row.id);
                setRows((prev) => prev.filter((r) => r.id !== row.id));
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

  const newButton = (
    <Button
      size="sm"
      className="h-11 gap-1 px-2 text-xs lg:h-7"
      onClick={() => setCreateOpen(true)}
    >
      <Plus className="h-3.5 w-3.5" />
      New campaign
    </Button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Campaigns you created or that live in your organizations.
          </span>
          <div className="ml-auto">{newButton}</div>
        </div>
        {error && (
          <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
        <MatrxDataTable<CampaignListRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={isLoading || !ctx}
          zebra
          detail={{ enabled: false }}
          window={{ enabled: false }}
          onRowOpen={(row) => router.push(`/crm/campaigns/${row.id}`)}
          toolbar={{ search: true, searchPlaceholder: "Search campaigns…" }}
          rowActions={(row) => (
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
          )}
          copy={{
            label: "Campaign",
            listLabel: "Campaigns",
            location: "/crm/campaigns",
            rowKind: "crm-campaign",
            listKind: "crm-campaign-list",
            humanRow: (row) =>
              `${row.name} (${row.campaign_kind}, ${row.status}) — ${memberCount(row)} members`,
            showRow: false,
            showToolbar: false,
          }}
          emptyState={{
            icon: <Megaphone className="h-5 w-5" />,
            title: "No campaigns yet",
            description:
              "Create one, then add members from the CRM list or from a saved filter — and power-dial it from the call queue.",
            action: newButton,
          }}
        />
      </div>

      <CampaignCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(campaign) => {
          toast.success(`${campaign.name} created`);
          router.push(`/crm/campaigns/${campaign.id}`);
        }}
      />
    </div>
  );
}
