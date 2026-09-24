"use client";

/**
 * Analytics dashboard for agent-apps.
 *
 * Reads the aggregate counters that already live on each `aga_apps` row
 * (`total_executions`, `total_tokens_used`, `total_cost`,
 * `unique_users_count`, `success_rate`, `avg_execution_time_ms`,
 * `last_execution_at`). For deeper time-window splits (executions_24h /
 * 7d / 30d) and percentile latencies (p50/p95) we'd need a dedicated
 * analytics view — added later as a follow-up if needed.
 *
 * Replaces the legacy `AnalyticsAdmin` from prompt-apps. The fundamental
 * shape is the same: overview cards on top, per-app table below.
 */

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import {
  Activity,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
} from "lucide-react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import {
  fetchAgentAppsAdmin,
  type AgentAppAdminView,
} from "@/lib/services/agent-apps-admin-service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { humanAgentApp } from "@/features/agent-apps/format";
import { UNKNOWN_DISPLAY, formatCount, formatDurationMs, formatPercentFromFraction, formatUsd, isKnownNumber, safeRatio } from "@ai-matrx/kit/format";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_AGENT_APPS_SURFACE_NAME,
  createAdminAgentAppsScope,
} from "@/features/surfaces/manifests/admin-agent-apps.manifest";

export const ANALYTICS_COVERAGE = { noun: "app", answeredBy: "client" } as const;

export const ANALYTICS_COLUMNS: MatrxColumnDef<AgentAppAdminView>[] = [
  {
    id: "name",
    header: "App",
    accessorKey: "name",
    filter: "text",
    width: 220,
    cell: (app) => (
      <EntityRef token="app" id={app.id} name={app.name} showIcon={false} />
    ),
  },
  {
    id: "slug",
    header: "Slug",
    accessorKey: "slug",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (app) => (
      <code className="block truncate text-xs" title={app.slug}>
        {app.slug}
      </code>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    filter: "select",
    filterOptions: ["draft", "published", "archived", "suspended"].map(
      (value) => ({ value, label: value }),
    ),
    width: 120,
    cell: (app) => <Badge variant="outline">{app.status}</Badge>,
  },
  {
    id: "category",
    header: "Category",
    accessorFn: (app) => app.category ?? "",
    filter: "text",
    width: 140,
    mobileHidden: true,
    cell: (app) => app.category ?? UNKNOWN_DISPLAY,
  },
  {
    id: "executions",
    header: "Executions",
    accessorKey: "total_executions",
    filter: "number",
    width: 110,
    className: "text-right tabular-nums",
    cell: (app) => formatCount(app.total_executions),
  },
  {
    id: "unique-users",
    header: "Users",
    accessorKey: "unique_users_count",
    filter: "number",
    width: 90,
    className: "text-right tabular-nums",
    mobileHidden: true,
    cell: (app) => formatCount(app.unique_users_count),
  },
  {
    id: "success-rate",
    header: "Success",
    accessorFn: (app) =>
      isKnownNumber(app.success_rate) ? app.success_rate * 100 : null,
    filter: "number",
    width: 100,
    className: "text-right tabular-nums",
    cell: (app) => formatPercentFromFraction(app.success_rate),
  },
  {
    id: "avg-execution-time",
    header: "Avg. time",
    accessorKey: "avg_execution_time_ms",
    filter: "number",
    width: 115,
    className: "text-right tabular-nums",
    mobileHidden: true,
    cell: (app) =>
      formatDurationMs(app.avg_execution_time_ms, {
        style: "compact",
        fallback: UNKNOWN_DISPLAY,
      }),
  },
  {
    id: "cost",
    header: "Cost",
    accessorKey: "total_cost",
    filter: "number",
    width: 100,
    className: "text-right tabular-nums",
    cell: (app) => formatUsd(app.total_cost, { digits: 4 }),
  },
  {
    id: "tokens",
    header: "Tokens",
    accessorKey: "total_tokens_used",
    filter: "number",
    width: 110,
    className: "text-right tabular-nums",
    mobileHidden: true,
    cell: (app) => formatCount(app.total_tokens_used),
  },
  {
    id: "last-execution",
    header: "Last run",
    accessorFn: (app) => app.last_execution_at ?? null,
    filter: "date",
    width: 150,
    mobileHidden: true,
    cell: (app) =>
      app.last_execution_at ? (
        <time dateTime={app.last_execution_at} className="text-xs text-muted-foreground">
          {new Date(app.last_execution_at).toLocaleString()}
        </time>
      ) : (
        UNKNOWN_DISPLAY
      ),
  },
  {
    id: "featured",
    header: "Featured",
    accessorKey: "is_featured",
    filter: "boolean",
    width: 100,
    mobileHidden: true,
  },
  {
    id: "verified",
    header: "Verified",
    accessorKey: "is_verified",
    filter: "boolean",
    width: 100,
    mobileHidden: true,
  },
  {
    id: "active",
    header: "Active",
    accessorFn: (app) =>
      isKnownNumber(app.total_executions) ? app.total_executions > 100 : null,
    filter: "boolean",
    width: 90,
    mobileHidden: true,
    cell: (app) =>
      !isKnownNumber(app.total_executions) ? (
        UNKNOWN_DISPLAY
      ) : app.total_executions > 100 ? (
        <Badge variant="outline" className="text-green-600 border-green-600">
          Active
        </Badge>
      ) : (
        "No"
      ),
  },
];

export default function AgentAppsAnalyticsPage() {
  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewApps, setViewApps] = useState<AgentAppAdminView[]>([]);
  const { toast } = useToast();
  const tableQuery = useTableUrlState({
    tableId: "admin-agent-apps-analytics",
    defaultSort: { id: "executions", direction: "desc" },
    defaultPageSize: 50,
  });

  const loadData = async () => {
    try {
      if (apps.length > 0) setRefreshing(true);
      else setLoading(true);
      // Omitting `limit` deliberately takes the service's readAllRows path.
      // Analytics coverage therefore describes every app this admin can read,
      // rather than a convenient but incomplete first page.
      const data = await fetchAgentAppsAdmin();
      setApps(data);
      setViewApps(data);
      setLoadError(null);
    } catch (error) {
      console.error("Error loading agent-app analytics:", error);
      const message =
        error instanceof Error ? error.message : "Failed to load analytics";
      setLoadError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const startLoad = useEffectEvent(() => {
    void loadData();
  });
  useEffect(() => {
    const timer = window.setTimeout(startLoad, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // A `?? 0` inside a SUM is the worst version of the lying-screen defect:
  // a row whose cost nobody measured lands in the total as a measured zero
  // and the error becomes invisible — the reader cannot tell a $0 total from
  // "we have no idea". These totals still ADD only what is known (dropping an
  // unknown is the only arithmetic available), but they COUNT what they had
  // to drop, and every surface below says so out loud.
  const totals = useMemo(() => {
    return apps.reduce(
      (acc, app) => ({
        totalExecutions:
          acc.totalExecutions +
          (isKnownNumber(app.total_executions) ? app.total_executions : 0),
        totalUniqueUsers:
          acc.totalUniqueUsers +
          (isKnownNumber(app.unique_users_count) ? app.unique_users_count : 0),
        totalCost:
          acc.totalCost + (isKnownNumber(app.total_cost) ? app.total_cost : 0),
        totalTokens:
          acc.totalTokens +
          (isKnownNumber(app.total_tokens_used) ? app.total_tokens_used : 0),
        appsMissingExecutions:
          acc.appsMissingExecutions +
          (isKnownNumber(app.total_executions) ? 0 : 1),
        appsMissingUniqueUsers:
          acc.appsMissingUniqueUsers +
          (isKnownNumber(app.unique_users_count) ? 0 : 1),
        appsMissingCost:
          acc.appsMissingCost + (isKnownNumber(app.total_cost) ? 0 : 1),
        appsMissingTokens:
          acc.appsMissingTokens +
          (isKnownNumber(app.total_tokens_used) ? 0 : 1),
      }),
      {
        totalExecutions: 0,
        totalUniqueUsers: 0,
        totalCost: 0,
        totalTokens: 0,
        appsMissingExecutions: 0,
        appsMissingUniqueUsers: 0,
        appsMissingCost: 0,
        appsMissingTokens: 0,
      },
    );
  }, [apps]);

  /** "at least" prefix + a plain-English caveat for a partial total. */
  const partial = (missing: number, noun: string) =>
    missing === 0
      ? { prefix: "", caveat: null as string | null }
      : {
          prefix: "at least ",
          caveat: `${missing} app${missing === 1 ? "" : "s"} report no ${noun}, so this total is incomplete`,
        };

  const costPartial = partial(totals.appsMissingCost, "cost");
  const tokensPartial = partial(totals.appsMissingTokens, "token count");
  const executionsPartial = partial(
    totals.appsMissingExecutions,
    "execution count",
  );
  const usersPartial = partial(totals.appsMissingUniqueUsers, "user count");

  // success_rate is stored as numeric(5,4) = 0..1 fraction. Multiply by 100
  // for display.
  //
  // The weighted average is only defined over apps that report BOTH a success
  // rate and an execution count; weighting an unknown rate by a known count
  // would drag the average toward a number nobody measured. With no such app
  // the denominator is zero and the answer is unknown, not "0.00%".
  const overallSuccessRate = useMemo(() => {
    const measured = apps.filter(
      (app) =>
        isKnownNumber(app.success_rate) &&
        isKnownNumber(app.total_executions),
    );
    const weightedSum = measured.reduce(
      (sum, app) => sum + (app.success_rate as number) * (app.total_executions as number),
      0,
    );
    const denominator = measured.reduce(
      (sum, app) => sum + (app.total_executions as number),
      0,
    );
    return safeRatio(weightedSum, denominator);
  }, [apps]);

  const measuredSuccessCount = apps.filter(
    (app) =>
      isKnownNumber(app.success_rate) && isKnownNumber(app.total_executions),
  ).length;

  const successRatePartial = partial(
    apps.length - measuredSuccessCount,
    "success rate",
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AGENT_APPS_SURFACE_NAME}
      getScope={() =>
        createAdminAgentAppsScope({
          admin_section: "analytics",
          analytics_totals: totals,
          // The scope declares this as a PERCENTAGE (0-100) while
          // `overallSuccessRate` is a 0..1 fraction — scaling it here is not
          // optional. `null` is not a value the shape carries; an
          // unmeasurable average is simply absent, never reported as 0.
          analytics_overall_success_rate:
            overallSuccessRate === null ? undefined : overallSuccessRate * 100,
          analytics_per_app_rows: apps.map((a) => ({
            id: a.id,
            name: a.name,
            slug: a.slug,
            status: a.status,
            category: a.category,
            creator_email: a.creator_email,
            is_featured: a.is_featured,
            is_verified: a.is_verified,
            total_executions: a.total_executions ?? null,
            unique_users_count: a.unique_users_count ?? null,
            success_rate: a.success_rate ?? null,
            total_cost: a.total_cost ?? null,
            updated_at: a.updated_at,
            avg_execution_time_ms: a.avg_execution_time_ms ?? null,
          })),
        })
      }
    >
    <div className="flex flex-col h-full w-full bg-textured overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <OverviewCard
              icon={<Activity className="w-4 h-4 text-blue-600" />}
              label="Total Executions"
              value={`${executionsPartial.prefix}${formatCount(totals.totalExecutions)}`}
              sub={
                executionsPartial.caveat ??
                "Measured execution total"
              }
              copyLabel="Total executions"
              copyAgent={() => ({
                kind: "agent-app-analytics-stat",
                location: "AI Matrx Admin — Agent Apps — Analytics",
                description: "The total-executions stat card.",
                data: {
                  totalExecutions: totals.totalExecutions,
                  appCount: apps.length,
                  appsMissingExecutions: totals.appsMissingExecutions,
                },
              })}
            />
            <OverviewCard
              icon={<Users className="w-4 h-4 text-purple-600" />}
              label="Unique Users"
              value={`${usersPartial.prefix}${formatCount(totals.totalUniqueUsers)}`}
              sub={usersPartial.caveat ?? "All identified callers"}
              copyLabel="Unique users"
              copyAgent={() => ({
                kind: "agent-app-analytics-stat",
                location: "AI Matrx Admin — Agent Apps — Analytics",
                description: "The unique-users stat card.",
                data: { totalUniqueUsers: totals.totalUniqueUsers },
              })}
            />
            <OverviewCard
              icon={<CheckCircle className="w-4 h-4 text-green-600" />}
              label="Success Rate"
              value={formatPercentFromFraction(overallSuccessRate, { digits: 2 })}
              sub={successRatePartial.caveat ?? "Execution-weighted average"}
              copyLabel="Success rate"
              copyAgent={() => ({
                kind: "agent-app-analytics-stat",
                location: "AI Matrx Admin — Agent Apps — Analytics",
                description: "The execution-weighted success-rate stat card.",
                data: {
                  overallSuccessRate:
                    overallSuccessRate === null
                      ? null
                      : overallSuccessRate * 100,
                  appsMissingSuccessRate: apps.length - measuredSuccessCount,
                },
              })}
            />
            <OverviewCard
              icon={<DollarSign className="w-4 h-4 text-green-600" />}
              label="Total Cost"
              value={`${costPartial.prefix}${formatUsd(totals.totalCost, { digits: 4 })}`}
              sub={[
                `${tokensPartial.prefix}${formatCount(totals.totalTokens)} tokens`,
                costPartial.caveat,
                tokensPartial.caveat,
              ]
                .filter(Boolean)
                .join(" · ")}
              copyLabel="Total cost"
              copyAgent={() => ({
                kind: "agent-app-analytics-stat",
                location: "AI Matrx Admin — Agent Apps — Analytics",
                description: "The total-cost stat card.",
                data: {
                  totalCost: totals.totalCost,
                  totalTokens: totals.totalTokens,
                  appsMissingCost: totals.appsMissingCost,
                  appsMissingTokens: totals.appsMissingTokens,
                },
              })}
            />
          </div>

          {loadError && (
            <div role="alert" className="text-sm text-destructive">
              Could not refresh app analytics: {loadError}{" "}
              <button type="button" className="underline" onClick={() => void loadData()}>
                Retry
              </button>
            </div>
          )}
          <div className="min-h-[32rem]">
            <MatrxDataTable<AgentAppAdminView>
              tableId="admin-agent-apps-analytics"
              data={apps}
              columns={ANALYTICS_COLUMNS}
              getRowId={(app) => app.id}
              isLoading={loading}
              isFetching={refreshing}
              stickyHeader
              pageSize={50}
              localPagination={{ mode: "progressive" }}
              query={{ mode: "controlled-local", state: tableQuery.state, onStateChange: tableQuery.onStateChange }}
              coverage={{ ...ANALYTICS_COVERAGE, total: apps.length }}
              toolbar={{
                title: "App performance",
                search: true,
                searchPlaceholder: "Search app analytics…",
                refresh: { onRefresh: loadData, label: "Refresh app analytics" },
                actions: viewApps.length > 0 ? (
                  <CopyButtons
                    size="icon"
                    label={`App performance (${viewApps.length})`}
                    human={() => viewApps.map(humanAgentApp).join("\n\n")}
                    json={() => viewApps}
                    agent={() => ({
                      kind: "agent-apps",
                      location: "AI Matrx Admin — Agent Apps — Analytics",
                      description: "Per-app performance aggregates currently shown after canonical table filters.",
                      data: viewApps,
                      attributes: { count: viewApps.length, totalCount: apps.length },
                    })}
                  />
                ) : undefined,
              }}
              detail={{ enabled: false }}
              window={{ enabled: false }}
              copy={false}
              emptyState={{ title: loadError ? "Could not load app analytics." : "No app analytics match the current view." }}
              onViewChange={setViewApps}
              rowActions={(app) => (
                <CopyButtons
                  size="xs"
                  label={app.name}
                  human={() => humanAgentApp(app)}
                  json={() => app}
                  agent={() => ({
                    kind: "agent-app",
                    location: "AI Matrx Admin — Agent Apps — Analytics",
                    description: "A single app's performance metrics.",
                    data: app,
                    summary: humanAgentApp(app),
                    attributes: { id: app.id, status: app.status },
                  })}
                />
              )}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
    </SurfaceRuntimeProvider>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  sub,
  copyLabel,
  copyAgent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  copyLabel: string;
  copyAgent: () => AgentPayloadInput;
}) {
  return (
    <Card className="group/x relative">
      <CardHeader className="pb-2 pr-16">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </CardContent>
      <CopyButtons
        size="xs"
        label={copyLabel}
        className="absolute top-3 right-3 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
        human={() => `${label}: ${value} (${sub})`}
        agent={copyAgent}
      />
    </Card>
  );
}
