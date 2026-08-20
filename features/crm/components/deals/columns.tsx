// features/crm/components/deals/columns.tsx
//
// The deals list's column registry. APP POLICY (features/agents/browse): a
// column either sorts AND filters SERVER-SIDE, or its controls do not render.
// Stage names resolve from `deal_pipeline` categories, so the columns are
// BUILT per render with the loaded pipelines rather than declared static.

import { Building2, CalendarClock, ChevronRight, User } from "lucide-react";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { formatRelativeTime } from "@/utils/datetime";
import { cn } from "@/lib/utils";
import {
  UserAvatarDisplay,
  resolveUserName,
} from "@/components/user/UserIdentity";
import type { UserLike } from "@/components/user/UserIdentity";
import type { DealListRow, DealPipeline, DealStage, DealStatus } from "../../deals/types";
import {
  DEAL_DATE_BUCKETS,
  DEAL_STATUS_LABEL,
  effectiveProbability,
  formatDealAmount,
} from "../../deals/types";

const DATE_BUCKET_OPTIONS = DEAL_DATE_BUCKETS.map((b) => ({
  value: b.value,
  label: b.label,
}));

/** One renderer for a deal status, everywhere — list, board, record. */
export function dealStatusBadge(status: string) {
  const s = (["open", "won", "lost"] as const).includes(status as DealStatus)
    ? (status as DealStatus)
    : "open";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        s === "won"
          ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : s === "lost"
            ? "border-destructive/20 bg-destructive/15 text-destructive"
            : "border-sky-500/20 bg-sky-500/15 text-sky-600 dark:text-sky-400",
      )}
    >
      {DEAL_STATUS_LABEL[s]}
    </span>
  );
}

/** Expected close, with overdue-on-an-open-deal stated rather than implied. */
export function expectedCloseCell(row: DealListRow) {
  if (!row.expected_close_date)
    return <span className="text-xs text-muted-foreground">—</span>;
  const overdue =
    row.status === "open" &&
    row.expected_close_date < new Date().toISOString().slice(0, 10);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarClock className="h-3 w-3 shrink-0" />
      {row.expected_close_date}
      {overdue && <span>(overdue)</span>}
    </span>
  );
}

export function buildDealColumns(args: {
  stageById: Map<string, DealStage>;
  /** The pipeline the list is narrowed to (stage filter options come from it). */
  pipeline: DealPipeline | null;
  memberById: Map<string, UserLike>;
}): MatrxColumnDef<DealListRow>[] {
  const { stageById, pipeline, memberById } = args;
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Deal",
      sortable: true,
      filter: "text",
      href: (row) => `/crm/deals/${row.id}`,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {row.name}
          </span>
          {row.status !== "open" && dealStatusBadge(row.status)}
          <span
            aria-hidden="true"
            className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-1 text-[11px] font-semibold text-primary sm:hidden"
          >
            Open
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      ),
    },
    {
      // Resolved from `deal_pipeline` categories client-side; the id IS a DB
      // column, so sorting/filtering stay server-side on stage_id.
      id: "stage_id",
      accessorFn: (row) => stageById.get(row.stage_id)?.name ?? "",
      header: "Stage",
      sortable: false,
      filter: pipeline ? "select" : false,
      filterOptions: pipeline
        ? pipeline.stages.map((s) => ({ value: s.id, label: s.name }))
        : undefined,
      cell: (row) => {
        const stage = stageById.get(row.stage_id);
        return stage ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            {stage.name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unknown stage</span>
        );
      },
      width: 150,
    },
    {
      id: "amount",
      accessorKey: "amount",
      header: "Value",
      sortable: true,
      filter: false,
      align: "right",
      cell: (row) => (
        <span className="text-xs font-medium tabular-nums text-foreground">
          {formatDealAmount(row.amount, row.currency)}
        </span>
      ),
      width: 110,
    },
    {
      id: "probability",
      accessorFn: (row) =>
        effectiveProbability(row, stageById.get(row.stage_id)) ?? "",
      header: "Win %",
      sortable: false,
      filter: false,
      align: "right",
      mobileHidden: true,
      cell: (row) => {
        const p = effectiveProbability(row, stageById.get(row.stage_id));
        return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {p === null ? "—" : `${p}%`}
          </span>
        );
      },
      width: 80,
    },
    {
      id: "party",
      accessorFn: (row) => row.party?.display_name ?? "",
      header: "With",
      sortable: false,
      filter: false,
      // THE DOOR LAW: the party is a record — full door set via EntityRef.
      entityToken: (row) => (row.party ? "party" : undefined),
      entityId: (row) => row.party?.id,
      cell: (row) =>
        row.party ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground">
            {row.party.party_kind === "person" ? (
              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{row.party.display_name}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "assigned_to",
      accessorFn: (row) =>
        row.assigned_to
          ? resolveUserName(memberById.get(row.assigned_to) ?? { id: row.assigned_to })
          : "",
      header: "Owner",
      sortable: false,
      filter: false,
      mobileHidden: true,
      cell: (row) => {
        if (!row.assigned_to)
          return <span className="text-xs text-muted-foreground">—</span>;
        const user = memberById.get(row.assigned_to) ?? { id: row.assigned_to };
        return (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <UserAvatarDisplay user={user} size="xs" />
            <span className="truncate text-xs text-foreground">
              {resolveUserName(user)}
            </span>
          </span>
        );
      },
      width: 140,
    },
    {
      id: "expected_close_date",
      accessorKey: "expected_close_date",
      header: "Expected close",
      sortable: true,
      filter: "select",
      filterOptions: DATE_BUCKET_OPTIONS.map((o) => ({
        value: o.value,
        label: `Within ${o.label.toLowerCase().replace("last ", "")}`,
      })),
      cell: (row) => expectedCloseCell(row),
      width: 150,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      sortable: false,
      filter: false, // the toolbar facet owns this — two controls would fight
      mobileHidden: true,
      cell: (row) => dealStatusBadge(row.status),
      width: 90,
    },
    {
      id: "stage_entered_at",
      accessorKey: "stage_entered_at",
      header: "In stage since",
      sortable: true,
      filter: false,
      mobileHidden: true,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(row.stage_entered_at)}
        </span>
      ),
      width: 130,
    },
    {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      sortable: true,
      filter: "select",
      filterOptions: DATE_BUCKET_OPTIONS,
      mobileHidden: true,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(row.updated_at)}
        </span>
      ),
      width: 120,
    },
  ];
}
