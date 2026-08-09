"use client";

// features/admin/relationships/components/ExposureAuditClient.tsx
//
// THE DOOR LAW: every row here is a REAL file or note owned by a REAL user in a
// REAL organization, and the row carries every id needed to open all three.
// Names go through `EntityRef` (route + new tab + peek, resolved from the
// registries), the owner through `AdminUserRef` (the console's one user door),
// the id column through `MatrxUuidCell` with the row's own resource_type, and
// the "N context" signal links to the Reachability Inspector prefilled with
// this record — a count that reaches the containers it counts.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  File,
  FileImage,
  Link2,
  Network,
  RefreshCw,
  SearchCheck,
  ShieldQuestion,
  StickyNote,
  Users,
} from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";
import type { ExposureAuditRow, ExposureAuditSummary } from "../types";

type ResourceFilter = "all" | "file" | "note";
type ExposureFilter =
  | "public"
  | "internal"
  | "link"
  | "shared"
  | "contextual"
  | "personal"
  | "all_exposed";

const INITIAL_QUERY: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "",
  anyOf: "",
  columnFilters: {},
  sort: null,
};

const VISIBILITY_STYLES: Record<string, string> = {
  public: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  internal:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  link: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  personal:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const EXPOSURE_OPTIONS: Array<{ value: ExposureFilter; label: string }> = [
  { value: "public", label: "Public exposure" },
  { value: "internal", label: "Organization-visible" },
  { value: "link", label: "Link-accessible" },
  { value: "shared", label: "Explicitly shared" },
  { value: "contextual", label: "Contextual access" },
  { value: "all_exposed", label: "All non-owner exposure" },
  { value: "personal", label: "Personal baseline" },
];

function countSummary(
  summaries: ExposureAuditSummary[],
  visibility: string,
): number {
  return summaries
    .filter((row) => row.visibility === visibility)
    .reduce((total, row) => total + row.active_count, 0);
}

function sumSummary(
  summaries: ExposureAuditSummary[],
  key: "active_share_link_count" | "active_grant_count" | "contextual_count",
): number {
  return summaries.reduce((total, row) => total + row[key], 0);
}

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(value).toLocaleDateString();
}

/**
 * The Reachability Inspector, prefilled with this record in "which containers
 * convey access to this item?" mode — the destination that lists the exact rows
 * `conveying_container_count` counts (admin_reachability_containers).
 */
function conveyingContainersHref(row: ExposureAuditRow): string {
  const params = new URLSearchParams({
    mode: "containers",
    type: row.resource_type,
    id: row.resource_id,
  });
  return `/administration/database/relationships/reachability?${params.toString()}`;
}

function ResourceIcon({ row }: { row: ExposureAuditRow }) {
  if (row.resource_type === "note") {
    return <StickyNote className="h-4 w-4 text-amber-500" />;
  }
  if (row.mime_type?.startsWith("image/")) {
    return <FileImage className="h-4 w-4 text-violet-500" />;
  }
  return <File className="h-4 w-4 text-sky-500" />;
}

interface SummaryCardProps {
  label: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

export function ExposureSummaryCard({
  label,
  value,
  description,
  icon,
  active,
  onClick,
}: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent/40",
        active && "border-primary bg-primary/5 ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {description}
      </p>
    </button>
  );
}

const COLUMNS: MatrxColumnDef<ExposureAuditRow>[] = [
  {
    id: "resource",
    accessorFn: (row) => `${row.resource_type} ${row.display_name}`,
    header: "Resource",
    filter: false,
    sortable: false,
    width: 260,
    cell: (row) => (
      <div className="flex min-w-0 items-start gap-2">
        <ResourceIcon row={row} />
        <div className="min-w-0">
          <EntityRef
            token={row.resource_type}
            id={row.resource_id}
            name={row.display_name}
            showIcon={false}
            className="text-xs font-medium"
          />
          <div className="truncate text-[10px] text-muted-foreground">
            {row.location || row.mime_type || row.resource_type}
          </div>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "visibility",
    header: "Visibility",
    filter: false,
    sortable: false,
    width: 100,
    cell: (row) => (
      <Badge
        variant="outline"
        className={cn(
          "py-0 text-[10px] capitalize",
          VISIBILITY_STYLES[row.visibility],
        )}
      >
        {row.visibility}
      </Badge>
    ),
  },
  {
    id: "reason",
    accessorFn: (row) => row.exposure_reasons.join(", "),
    header: "Why reachable",
    filter: false,
    sortable: false,
    width: 280,
    cell: (row) => (
      <div className="max-w-[18rem]">
        <div className="line-clamp-2 text-xs">{row.discovery_status}</div>
        <div className="line-clamp-1 text-[10px] text-muted-foreground">
          {row.exposure_reasons.join(" · ")}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "owner_email",
    header: "Owner",
    filter: false,
    sortable: false,
    width: 190,
    cell: (row) =>
      row.owner_id ? (
        <AdminUserRef
          userId={row.owner_id}
          email={row.owner_email}
          className="max-w-[12rem]"
        />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "organization_name",
    header: "Organization",
    filter: false,
    sortable: false,
    width: 170,
    cell: (row) =>
      row.organization_id ? (
        <EntityRef
          token="organization"
          id={row.organization_id}
          name={row.organization_name}
          showIcon={false}
          className="max-w-[11rem] text-xs text-muted-foreground"
        />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: "signals",
    accessorFn: (row) =>
      `${row.direct_grant_count}/${row.organization_grant_count}/${row.active_share_link_count}/${row.conveying_container_count}`,
    header: "Signals",
    filter: false,
    sortable: false,
    width: 160,
    cell: (row) => (
      <div className="flex flex-wrap gap-1">
        {row.broad_discovery ? (
          <Badge variant="destructive" className="py-0 text-[9px]">
            broad
          </Badge>
        ) : null}
        {row.active_share_link_count > 0 ? (
          <Badge variant="outline" className="py-0 text-[9px]">
            {row.active_share_link_count} link
          </Badge>
        ) : null}
        {row.direct_grant_count + row.organization_grant_count > 0 ? (
          <Badge variant="outline" className="py-0 text-[9px]">
            {row.direct_grant_count + row.organization_grant_count} grant
          </Badge>
        ) : null}
        {row.conveying_container_count > 0 ? (
          <Link
            href={conveyingContainersHref(row)}
            onClick={(event) => event.stopPropagation()}
            title={`Open the ${row.conveying_container_count} container(s) conveying access to ${row.display_name}${
              row.conveying_container_types?.length
                ? ` — ${row.conveying_container_types.join(", ")}`
                : ""
            }`}
          >
            <Badge
              variant="outline"
              className="py-0 text-[9px] transition-colors hover:border-primary/50 hover:bg-accent"
            >
              {row.conveying_container_count} context
            </Badge>
          </Link>
        ) : null}
        {row.is_system_artifact ? (
          <Badge variant="secondary" className="py-0 text-[9px]">
            system
          </Badge>
        ) : null}
        {row.is_derived ? (
          <Badge variant="secondary" className="py-0 text-[9px]">
            derived
          </Badge>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    filter: false,
    sortable: false,
    align: "right",
    width: 90,
    cell: (row) => (
      <span
        className="text-xs tabular-nums text-muted-foreground"
        title={new Date(row.updated_at).toLocaleString()}
      >
        {relativeTime(row.updated_at)}
      </span>
    ),
  },
  {
    accessorKey: "resource_id",
    header: "ID",
    filter: false,
    sortable: false,
    cellKind: "uuid",
    // Per-row token — this table mixes files and notes, and both are registered
    // with a route AND a peek, so the raw FK column opens its own record.
    fk: { label: "Resource", token: (row) => row.resource_type },
    width: 120,
  },
];

export function ExposureAuditClient() {
  const [summaries, setSummaries] = useState<ExposureAuditSummary[]>([]);
  const [rows, setRows] = useState<ExposureAuditRow[]>([]);
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>("all");
  const [exposureFilter, setExposureFilter] =
    useState<ExposureFilter>("public");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [query, setQuery] = useState<MatrxDataTableQueryState>(INITIAL_QUERY);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadSummary() {
      const { data, error } = await supabase.rpc(
        "admin_exposure_audit_summary",
      );
      if (cancelled) return;
      if (error) {
        toast.error(`Exposure summary failed: ${error.message}`);
        return;
      }
      setSummaries(data ?? []);
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const timer = window.setTimeout(
      () => {
        async function loadRows() {
          setIsFetching(true);
          const { data, error } = await supabase.rpc(
            "admin_exposure_audit_rows",
            {
              p_resource_type:
                resourceFilter === "all" ? undefined : resourceFilter,
              p_exposure: exposureFilter,
              p_search: query.search.trim() || undefined,
              p_include_deleted: includeDeleted,
              p_limit: query.pageSize,
              p_offset: (query.page - 1) * query.pageSize,
            },
          );
          if (cancelled) return;
          if (error) {
            setRows([]);
            setTotal(0);
            toast.error(`Exposure audit failed: ${error.message}`);
          } else {
            const nextRows = data ?? [];
            setRows(nextRows);
            setTotal(nextRows[0]?.total_count ?? 0);
          }
          setIsLoading(false);
          setIsFetching(false);
        }

        void loadRows();
      },
      query.search ? 300 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    exposureFilter,
    includeDeleted,
    query.page,
    query.pageSize,
    query.search,
    refreshNonce,
    resourceFilter,
  ]);

  function selectExposure(next: ExposureFilter) {
    setExposureFilter(next);
    setQuery((current) => ({ ...current, page: 1 }));
  }

  const publicCount = countSummary(summaries, "public");
  const internalCount = countSummary(summaries, "internal");
  const personalCount = countSummary(summaries, "personal");
  const linkCount = sumSummary(summaries, "active_share_link_count");
  const sharedCount = sumSummary(summaries, "active_grant_count");
  const contextualCount = sumSummary(summaries, "contextual_count");

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldQuestion className="h-5 w-5 text-primary" />
            Exposure Audit
          </h1>
          <p className="max-w-4xl text-xs text-muted-foreground">
            Cross-user inventory for files and notes. Each row explains whether
            it is reachable through public visibility, an organization, a link,
            an explicit grant, or a conveying container.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-8"
          disabled={isFetching}
          onClick={() => setRefreshNonce((value) => value + 1)}
        >
          <RefreshCw
            className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      <Alert>
        <SearchCheck className="h-4 w-4" />
        <AlertTitle>Discovery is stricter than access</AlertTitle>
        <AlertDescription className="text-xs">
          Public notes can enter agent/RAG search. Public files are anonymously
          readable by ID, but the canonical personal file tree and search now
          enumerate only owned or explicitly granted files.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <ExposureSummaryCard
          label="Public"
          value={publicCount}
          description="Broadly readable; public notes are agent-searchable."
          icon={<SearchCheck className="h-4 w-4 text-rose-500" />}
          active={exposureFilter === "public"}
          onClick={() => selectExposure("public")}
        />
        <ExposureSummaryCard
          label="Internal"
          value={internalCount}
          description="Visible through organization membership."
          icon={<Users className="h-4 w-4 text-amber-500" />}
          active={exposureFilter === "internal"}
          onClick={() => selectExposure("internal")}
        />
        <ExposureSummaryCard
          label="Active links"
          value={linkCount}
          description="Live share links across files and notes."
          icon={<Link2 className="h-4 w-4 text-sky-500" />}
          active={exposureFilter === "link"}
          onClick={() => selectExposure("link")}
        />
        <ExposureSummaryCard
          label="Active grants"
          value={sharedCount}
          description="User, organization, or public permission grants."
          icon={<Users className="h-4 w-4 text-violet-500" />}
          active={exposureFilter === "shared"}
          onClick={() => selectExposure("shared")}
        />
        <ExposureSummaryCard
          label="Contextual"
          value={contextualCount}
          description="Rows reached through attached containers."
          icon={<Network className="h-4 w-4 text-cyan-500" />}
          active={exposureFilter === "contextual"}
          onClick={() => selectExposure("contextual")}
        />
        <ExposureSummaryCard
          label="Personal"
          value={personalCount}
          description="Owner-only baseline unless another signal exists."
          icon={<ShieldQuestion className="h-4 w-4 text-emerald-500" />}
          active={exposureFilter === "personal"}
          onClick={() => selectExposure("personal")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Select
          value={resourceFilter}
          onValueChange={(value: ResourceFilter) => {
            setResourceFilter(value);
            setQuery((current) => ({ ...current, page: 1 }));
          }}
        >
          <SelectTrigger className="h-11 w-36 sm:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Files + notes</SelectItem>
            <SelectItem value="file">Files only</SelectItem>
            <SelectItem value="note">Notes only</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={exposureFilter}
          onValueChange={(value: ExposureFilter) => selectExposure(value)}
        >
          <SelectTrigger className="h-11 w-52 sm:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPOSURE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted-foreground sm:min-h-8">
          <Checkbox
            checked={includeDeleted}
            onCheckedChange={(checked) => {
              setIncludeDeleted(checked === true);
              setQuery((current) => ({ ...current, page: 1 }));
            }}
          />
          Include deleted
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <MatrxDataTable<ExposureAuditRow>
          data={rows}
          columns={COLUMNS}
          getRowId={(row) => `${row.resource_type}:${row.resource_id}`}
          isLoading={isLoading}
          isFetching={isFetching}
          query={{
            mode: "controlled",
            state: query,
            totalItems: total,
            onStateChange: setQuery,
          }}
          toolbar={{ searchPlaceholder: "Search name, path, folder, or UUID…" }}
          zebra
          className="h-full text-xs"
          copy={{
            label: "Exposure finding",
            listLabel: "Exposure audit results",
            location:
              "AI Matrx Admin — Relationships → Exposure Audit (/administration/database/relationships/exposure-audit)",
            rowKind: "exposure-finding",
            listKind: "exposure-findings",
            humanRow: (row) =>
              `${row.resource_type}:${row.resource_id} — ${row.display_name}\n${row.discovery_status}\n${row.exposure_reasons.join("; ")}`,
            rowAttributes: (row) => ({
              resource_type: row.resource_type,
              visibility: row.visibility,
              owner: row.owner_email,
              broad_discovery: row.broad_discovery,
            }),
            listAttributes: (visible) => ({
              visible: visible.length,
              total,
              exposure: exposureFilter,
              resource: resourceFilter,
            }),
          }}
          detail={{
            title: (row) => row.display_name,
            description: (row) =>
              `${row.resource_type}:${row.resource_id} · ${row.discovery_status}`,
          }}
          window={{ enabled: true, title: (row) => row.display_name }}
          emptyState={{
            title: "No matching exposure",
            description:
              "No files or notes match this exposure, resource, and search combination.",
          }}
        />
      </div>
    </section>
  );
}
