"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { AppletRef } from "@/features/applets/components/AppletRef";
import {
  ADMIN_APPLETS_SURFACE_NAME,
  createAdminAppletsScope,
} from "@/features/surfaces/manifests/admin-applets.manifest";
import {
  fetchAppletRateLimits,
  unblockAppletRateLimit,
  type AppletRateLimitRow,
} from "@/lib/services/applets-admin-service";
import { useToast } from "@/components/ui/use-toast";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { ShieldCheckTapButton } from "@ai-matrx/tap-target/buttons";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import { Globe, Shield, ShieldOff, User } from "lucide-react";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";

const RATE_LIMITS_TABLE_ID = "admin-applet-rate-limits";

function humanRateLimit(limit: AppletRateLimitRow): string {
  const identifier = limit.user_id
    ? `User: ${limit.user_id}`
    : limit.ip_address
      ? `IP: ${limit.ip_address}`
      : limit.fingerprint
        ? `Fingerprint: ${limit.fingerprint}`
        : "Unknown identifier";
  return [
    `${limit.app_name ?? limit.app_id} — ${limit.is_blocked ? "Blocked" : "Active"}`,
    identifier,
    `Executions: ${limit.execution_count}`,
    `First: ${new Date(limit.first_execution_at).toLocaleString()}`,
    `Last: ${new Date(limit.last_execution_at).toLocaleString()}`,
    limit.blocked_until
      ? `Blocked until: ${new Date(limit.blocked_until).toLocaleString()}`
      : null,
    limit.blocked_reason ? `Reason: ${limit.blocked_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function identifierKind(
  row: AppletRateLimitRow,
): "User" | "IP" | "Fingerprint" | "Unknown" {
  if (row.user_id) return "User";
  if (row.ip_address) return "IP";
  if (row.fingerprint) return "Fingerprint";
  return "Unknown";
}

function identifierValue(row: AppletRateLimitRow): string {
  return row.user_id ?? row.ip_address ?? row.fingerprint ?? "";
}

function IdentifierCell({ row }: { row: AppletRateLimitRow }) {
  const value = identifierValue(row);
  const kind = identifierKind(row);
  const Icon = kind === "User" ? User : kind === "IP" ? Globe : ShieldOff;
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={value || undefined}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-mono text-xs">
        {value || "Unknown"}
      </span>
      <Badge variant="outline" className="shrink-0 text-xs">
        {kind}
      </Badge>
    </span>
  );
}

export function RateLimitsClient() {
  const { toast } = useToast();
  const [rateLimits, setRateLimits] = useState<AppletRateLimitRow[]>([]);
  const [visibleRows, setVisibleRows] = useState<AppletRateLimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The last read's failure (RC-B12 r13): with no rows it IS the view (no
  // "No rate limits found", no 0 tiles); with rows it is said above them.
  const [readError, setReadError] = useState<unknown>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [blockedFilter, setBlockedFilter] = useState<
    "all" | "blocked" | "not-blocked"
  >("blocked");
  const tableQuery = useTableUrlState({
    tableId: RATE_LIMITS_TABLE_ID,
    defaultSort: { id: "last_execution_at", direction: "desc" },
    defaultPageSize: 25,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const isBlocked =
        blockedFilter === "all" ? undefined : blockedFilter === "blocked";
      setRateLimits(await fetchAppletRateLimits({ is_blocked: isBlocked }));
      setReadError(null);
    } catch (error) {
      console.error("Error loading rate limits:", error);
      setReadError(error ?? new Error("The rate limits read failed"));
    } finally {
      setLoading(false);
    }
  }, [blockedFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleUnblock = async (limit: AppletRateLimitRow) => {
    const label = limit.user_id
      ? "user"
      : limit.ip_address
        ? "IP"
        : "fingerprint";
    const confirmed = await confirmDialog({
      title: "Unblock rate limit",
      description: `Unblock this ${label}?`,
      confirmLabel: "Unblock",
    });
    if (!confirmed) return;
    try {
      setUnblockingId(limit.id);
      await unblockAppletRateLimit(limit.id);
      await loadData();
      toast({
        title: "Unblocked",
        description: "Rate limit unblocked successfully",
      });
    } catch (error) {
      console.error("Error unblocking rate limit:", error);
      toast({
        title: "Error",
        description: "Failed to unblock rate limit",
        variant: "destructive" as const,
      });
    } finally {
      setUnblockingId(null);
    }
  };

  const stats = {
    total: rateLimits.length,
    blocked: rateLimits.filter((row) => row.is_blocked).length,
    active: rateLimits.filter((row) => !row.is_blocked).length,
    users: rateLimits.filter((row) => Boolean(row.user_id)).length,
    ips: rateLimits.filter((row) => Boolean(row.ip_address) && !row.user_id)
      .length,
  };

  const columns: MatrxColumnDef<AppletRateLimitRow>[] = [
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => (row.is_blocked ? "Blocked" : "Active"),
      filter: "select",
      width: 110,
      cell: (row) =>
        row.is_blocked ? (
          <Badge variant="destructive">
            <ShieldOff className="mr-1 h-3 w-3" />
            Blocked
          </Badge>
        ) : (
          <Badge variant="outline" className="border-green-600 text-green-600">
            <Shield className="mr-1 h-3 w-3" />
            Active
          </Badge>
        ),
    },
    {
      id: "app_name",
      header: "App",
      accessorFn: (row) => row.app_name ?? row.app_id,
      filter: "text",
      width: 220,
      frozen: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <AppletRef
            appId={row.app_id}
            name={row.app_name ?? row.app_id}
            slug={row.app_slug ?? undefined}
          />
        </span>
      ),
    },
    {
      accessorKey: "app_slug",
      header: "Applet slug",
      filter: "text",
      width: 180,
      hidden: true,
      mobileHidden: true,
    },
    {
      accessorKey: "id",
      header: "Rate limit ID",
      cellKind: "uuid",
      filter: "text",
      width: 180,
      mobileHidden: true,
    },
    {
      id: "identifier",
      header: "Identifier",
      accessorFn: identifierValue,
      filter: "text",
      width: 290,
      cell: (row) => <IdentifierCell row={row} />,
    },
    {
      id: "identifier_type",
      header: "Identifier type",
      accessorFn: identifierKind,
      filter: "select",
      hidden: true,
      mobileHidden: true,
    },
    {
      accessorKey: "execution_count",
      header: "Executions",
      filter: "number",
      width: 120,
      align: "right",
      mobileHidden: true,
    },
    {
      accessorKey: "first_execution_at",
      header: "First execution",
      filter: "date",
      format: { id: "datetime" },
      width: 180,
      mobileHidden: true,
    },
    {
      accessorKey: "last_execution_at",
      header: "Last execution",
      filter: "date",
      format: { id: "datetime" },
      width: 180,
      mobileHidden: true,
    },
    {
      accessorKey: "window_start_at",
      header: "Window start",
      filter: "date",
      format: { id: "datetime" },
      hidden: true,
      mobileHidden: true,
    },
    {
      accessorKey: "blocked_until",
      header: "Blocked until",
      filter: "date",
      format: { id: "datetime" },
      width: 180,
      mobileHidden: true,
    },
    {
      accessorKey: "blocked_reason",
      header: "Block reason",
      filter: "text",
      width: 240,
      mobileHidden: true,
      cell: (row) => (
        <span
          className="block truncate"
          title={row.blocked_reason ?? undefined}
        >
          {row.blocked_reason ?? "—"}
        </span>
      ),
    },
  ];

  // Counts derived from a read that failed with nothing on screen are unknown,
  // never 0.
  const statsUnknown = readError != null && rateLimits.length === 0;

  if (loading && rateLimits.length === 0 && readError == null) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLETS_SURFACE_NAME}
      getScope={() =>
        createAdminAppletsScope({
          admin_section: "rate_limits",
          rate_limits_rows: visibleRows.map((row) => ({
            app_name: row.app_name ?? "",
            app_slug: row.app_slug ?? "",
            user_id: row.user_id ?? null,
            ip_address: row.ip_address ?? null,
            fingerprint: row.fingerprint ?? null,
            is_blocked: row.is_blocked,
            id: row.id,
            execution_count: row.execution_count,
            first_execution_at: row.first_execution_at,
            last_execution_at: row.last_execution_at,
            window_start_at: row.window_start_at,
            blocked_until: row.blocked_until ?? null,
            blocked_reason: row.blocked_reason ?? null,
          })),
          rate_limits_stats: stats,
          rate_limits_filters: { blocked: blockedFilter },
          rate_limits_table_query: tableQuery.state as unknown as Record<
            string,
            unknown
          >,
        })
      }
    >
      <div
        data-matrx-table-page
        className="flex h-full min-h-0 flex-col gap-3 p-4"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["Blocked loaded", stats.blocked, "text-destructive"],
            ["Active loaded", stats.active, "text-green-600"],
            ["User limits loaded", stats.users, "text-purple-600"],
          ].map(([label, value, color]) => (
            <Card key={label as string}>
              <CardContent className="p-2">
                <div className={`text-2xl font-bold ${color}`}>
                  {statsUnknown ? "—" : (value as number)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {label as string}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {readError != null && !statsUnknown && (
          <StaleDataNotice
            hasData
            what="the rate limits"
            detail={readError instanceof Error ? readError.message : String(readError)}
            onRetry={() => void loadData()}
            retrying={loading}
          />
        )}
        {statsUnknown ? (
          <ReadFailure
            error={readError}
            what="the rate limits"
            onRetry={() => void loadData()}
            className="m-0"
          />
        ) : (
        <MatrxDataTable
          tableId={RATE_LIMITS_TABLE_ID}
          data={rateLimits}
          columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (row) =>
            row.is_blocked ? (
              <ShieldCheckTapButton
                variant="transparent"
                label="Unblock"
                ariaLabel="Unblock rate limit"
                tooltip="Unblock rate limit"
                onClick={() => void handleUnblock(row)}
                disabled={unblockingId !== null}
              />
            ) : null }]}
          getRowId={(row) => row.id}
          isLoading={loading && rateLimits.length === 0}
          isFetching={loading && rateLimits.length > 0}
          stickyHeader
          pageSize={25}
          localPagination={{ mode: "numbered", reason: "Rate-limit rows keep exact page sizes and stable canonical footer controls.", approvedBy: "Arman, September 27 2026 footer rule" }}
          query={{
            mode: "controlled-local",
            state: tableQuery.state,
            onStateChange: tableQuery.onStateChange,
          }}
          coverage={{
            noun: "rate limit",
            answeredBy: "client",
            total: rateLimits.length,
          }}
          toolbar={{
            title: "Rate limits",
            search: true,
            searchPlaceholder: "Search Applets and identifiers…",
            facets: [
              {
                type: "button-group",
                id: "source-status",
                label: "Source status",
                value: blockedFilter,
                defaultValue: "blocked",
                options: [
                  { value: "blocked", label: "Blocked" },
                  { value: "not-blocked", label: "Active" },
                  { value: "all", label: "All" },
                ],
                onChange: (value) =>
                  setBlockedFilter(value as "all" | "blocked" | "not-blocked"),
              },
            ],
            refresh: { onRefresh: loadData, label: "Refresh rate limits" },
          }}
          copy={{
            label: "Rate limit",
            listLabel: "Rate limits (this view)",
            location: "AI Matrx Admin — Applets — Rate Limits",
            rowKind: "applet-rate-limit",
            listKind: "applet-rate-limits",
            rowDescription: "A single rate limit row.",
            listDescription:
              "Rate limit rows currently shown after the canonical table filters.",
            humanRow: humanRateLimit,
            agentRow: (row) => row,
            rowAttributes: (row) => ({
              id: row.id,
              is_blocked: row.is_blocked,
            }),
            listAttributes: (visible) => ({ count: visible.length }),
            export: (visible) => ({
              items: [
                jsonExportItem(() => visible, "JSON (this view)"),
                csvExportItem(
                  () => visible as unknown as Array<Record<string, unknown>>,
                  "CSV (this view)",
                ),
              ],
            }),
          }}

          detail={{ enabled: false }}
          window={{ enabled: false }}
          emptyState={{
            title: "No rate limits found",
            description:
              "Change the source status or clear a table filter to see other loaded limits.",
          }}
          onViewChange={setVisibleRows}
        />
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
