"use client";

// features/admin/applications/installations/components/InstallationsClient.tsx
//
// Installations tab of the Applications hub — the real installed fleet, read
// via the admin_list_app_instances SECURITY DEFINER RPC. Read-only: this
// surface reports what is in the field, it does not mutate instances.
//
// Version standing is the point of the table. Every instance is compared
// against the LIVE min_supported_app_version published in app_config, and an
// instance running below it is called out loudly (destructive badge + a
// summary counter + a boolean column filter). Instances that have not
// reported a version yet render as "not reported" — honestly unknown, never
// laundered into a false compliance failure.
//
// Filtering/sorting is entirely MatrxDataTable's: platform is a select column
// filter, "active only" and "below minimum" are boolean column filters. No
// bespoke filter state lives here.

import { useCallback, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Cpu, HardDrive, MemoryStick, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { createClient } from "@/utils/supabase/client";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { versionStanding } from "@/features/admin/applications/version";
import type { VersionStanding } from "@/features/admin/applications/version";
import type { AppInstanceRow } from "@/features/admin/applications/installations/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLICATIONS_SURFACE_NAME,
  createAdminApplicationsScope,
} from "@/features/surfaces/manifests/admin-applications.manifest";

interface InstallationsClientProps {
  initialRows: AppInstanceRow[];
  /** Live min_supported_app_version from app_config for this application. */
  minSupportedVersion: string | null;
  /** The application these instances belong to (for labelling). */
  app: string;
}

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function standingBadge(standing: VersionStanding, version: string | null) {
  if (standing === "below") {
    return (
      <Badge variant="destructive" className="font-mono">
        {version}
      </Badge>
    );
  }
  if (standing === "unknown") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-muted-foreground">
            not reported
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          This instance has not reported an application version yet. Version
          reporting ships with the desktop client — older installs stay blank
          until they update and check in again.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 font-mono text-emerald-600 dark:text-emerald-400"
    >
      {version}
    </Badge>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "muted";
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div
        className={
          tone === "danger"
            ? "text-lg font-semibold text-destructive"
            : "text-lg font-semibold text-foreground"
        }
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function InstallationsClient({
  initialRows,
  minSupportedVersion,
  app,
}: InstallationsClientProps) {
  const { toast } = useToast();
  // Clock captured once on mount (lazy initializer) — the 7-day activity
  // window must not drift on every re-render.
  const [nowMs] = useState(() => Date.now());
  const [rows, setRows] = useState<AppInstanceRow[]>(initialRows);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_list_app_instances");
    setRefreshing(false);
    if (error) {
      toast({
        title: "Failed to refresh installations",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setRows(data ?? []);
  }, [toast]);

  const standingOf = useCallback(
    (row: AppInstanceRow): VersionStanding =>
      versionStanding(row.app_version, minSupportedVersion),
    [minSupportedVersion],
  );

  const summary = useMemo(() => {
    const cutoff = nowMs - ACTIVE_WINDOW_MS;
    let recent = 0;
    let below = 0;
    let unknown = 0;
    for (const row of rows) {
      if (row.last_seen && new Date(row.last_seen).getTime() >= cutoff) {
        recent += 1;
      }
      const standing = standingOf(row);
      if (standing === "below") below += 1;
      if (standing === "unknown") unknown += 1;
    }
    return { total: rows.length, recent, below, unknown };
  }, [rows, standingOf, nowMs]);

  const columns = useMemo((): MatrxColumnDef<AppInstanceRow>[] => {
    return [
      {
        id: "instance_name",
        accessorKey: "instance_name",
        header: "Instance",
        cell: (row) => (
          <span className="text-sm font-medium">
            {row.instance_name || (
              <span className="text-muted-foreground">unnamed</span>
            )}
          </span>
        ),
        width: 180,
      },
      {
        // THE DOOR LAW, honestly: there is no `user` entity token and no
        // `/users/<id>` route to open, so the owning user's id is rendered
        // copyable beside the email instead of as an unopenable string. When a
        // user record route lands, this column becomes an EntityRef.
        id: "user_email",
        accessorKey: "user_email",
        header: "User",
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm" title={row.user_email}>
              {row.user_email}
            </span>
            <MatrxUuidCell value={row.user_id} label="User id" />
          </span>
        ),
        width: 240,
      },
      {
        id: "app_version",
        header: "Version",
        accessorFn: (row) => row.app_version ?? "",
        filter: "select",
        cell: (row) => standingBadge(standingOf(row), row.app_version),
        width: 130,
      },
      {
        id: "below_min",
        header: "Below minimum",
        accessorFn: (row) => standingOf(row) === "below",
        filter: "boolean",
        align: "center",
        cell: (row) =>
          standingOf(row) === "below" ? (
            <TriangleAlert className="mx-auto h-4 w-4 text-destructive" />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 120,
      },
      {
        id: "platform",
        accessorKey: "platform",
        header: "Platform",
        filter: "select",
        cell: (row) => (
          <span className="text-xs">
            {row.platform || <span className="text-muted-foreground">—</span>}
          </span>
        ),
        width: 110,
      },
      {
        id: "os_version",
        accessorKey: "os_version",
        header: "OS",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.os_version || "—"}
          </span>
        ),
        width: 140,
      },
      {
        id: "architecture",
        accessorKey: "architecture",
        header: "Arch",
        filter: "select",
        cell: (row) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.architecture || "—"}
          </span>
        ),
        width: 90,
      },
      {
        id: "cpu_cores",
        accessorKey: "cpu_cores",
        header: "Cores",
        align: "right",
        cell: (row) => (
          <span className="font-mono text-xs">{row.cpu_cores ?? "—"}</span>
        ),
        width: 80,
      },
      {
        id: "ram_total_gb",
        accessorKey: "ram_total_gb",
        header: "RAM (GB)",
        align: "right",
        cell: (row) => (
          <span className="font-mono text-xs">{row.ram_total_gb ?? "—"}</span>
        ),
        width: 100,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        align: "center",
        cell: (row) => (
          <span className="text-xs">{row.is_active ? "Yes" : "No"}</span>
        ),
        width: 80,
      },
      {
        id: "tunnel_active",
        accessorKey: "tunnel_active",
        header: "Tunnel",
        filter: "boolean",
        align: "center",
        cell: (row) =>
          row.tunnel_active ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            >
              up
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 90,
      },
      {
        id: "last_seen",
        accessorKey: "last_seen",
        header: "Last seen",
        cell: (row) =>
          row.last_seen ? (
            <span
              className="whitespace-nowrap text-xs"
              title={format(new Date(row.last_seen), "yyyy-MM-dd HH:mm:ss")}
            >
              {formatDistanceToNow(new Date(row.last_seen), {
                addSuffix: true,
              })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">never</span>
          ),
        width: 140,
      },
      {
        id: "instance_id",
        accessorKey: "instance_id",
        header: "Instance ID",
        cellKind: "uuid",
        sortable: false,
        filter: false,
        width: 120,
      },
    ];
  }, [standingOf]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLICATIONS_SURFACE_NAME}
      getScope={() =>
        createAdminApplicationsScope({
          active_tab: "installations",
          installation_app: app,
          installation_count: summary.total,
          installation_below_min_count: summary.below,
          installation_min_supported_version: minSupportedVersion,
        })
      }
    >
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryStat label="Total installations" value={summary.total} />
          <SummaryStat label="Active last 7 days" value={summary.recent} />
          <SummaryStat
            label="Below min version"
            value={summary.below}
            tone={summary.below > 0 ? "danger" : undefined}
          />
          <SummaryStat label="Version not reported" value={summary.unknown} />
        </div>
        <p className="text-xs text-muted-foreground">
          Minimum supported version for{" "}
          <code className="font-mono">{app}</code>:{" "}
          <code className="font-mono">{minSupportedVersion ?? "not set"}</code>
        </p>
      </div>

      {summary.below > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{summary.below}</strong> installed{" "}
            {summary.below === 1 ? "instance is" : "instances are"} running
            below the published minimum supported version (
            <code className="font-mono">{minSupportedVersion}</code>). Filter
            the “Below minimum” column to see them.
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isFetching={refreshing}
          pageSize={50}
          emptyState={{
            icon: <HardDrive className="h-5 w-5" />,
            title: "No installations",
            description:
              "No installed instances have checked in yet, or none match your filters.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search instance, user, platform…",
            actions: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
                disabled={refreshing}
              >
                Refresh
              </Button>
            ),
          }}
          detail={{
            title: (row) => row.instance_name || row.instance_id,
            description: (row) => row.user_email,
          }}
          copy={{
            label: "Installation",
            listLabel: "Installations (this view)",
            location: `${APPLICATIONS_ADMIN_LOCATION}/installations`,
            rowKind: "app_instance",
            listKind: "app_instances",
            rowDescription: "One installed client instance from the fleet.",
            listDescription:
              "Filtered/sorted installed instances currently visible.",
            humanRow: (row) =>
              [
                `${row.instance_name || "(unnamed)"} — ${row.user_email}`,
                `version=${row.app_version ?? "not reported"} standing=${standingOf(row)}`,
                `platform=${row.platform || "?"} os=${row.os_version || "?"} arch=${row.architecture || "?"}`,
                `cpu=${row.cpu_model || "?"} cores=${row.cpu_cores ?? "?"} ram_gb=${row.ram_total_gb ?? "?"}`,
                `active=${row.is_active} tunnel=${row.tunnel_active} last_seen=${row.last_seen ?? "never"}`,
              ].join("\n"),
            rowAttributes: (row) => ({
              instance_id: row.instance_id,
              app_version: row.app_version,
              standing: standingOf(row),
              platform: row.platform,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
              below_min_version: summary.below,
              min_supported_app_version: minSupportedVersion,
            }),
          }}
          rowActions={(row) => (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              <span className="max-w-40 truncate" title={row.cpu_model ?? ""}>
                {row.cpu_model || "—"}
              </span>
              <MemoryStick className="ml-1 h-3.5 w-3.5" />
              <span className="font-mono">{row.ram_total_gb ?? "—"}</span>
            </div>
          )}
        />
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}
