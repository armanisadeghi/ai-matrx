"use client";

import { Suspense, useEffect, useEffectEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { MoreHorizontalTapButton } from "@ai-matrx/tap-target/buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import type {
  ColumnFilterValue,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import { formatCount, formatDurationMs, formatUsd } from "@ai-matrx/kit/format";
import { ProTextarea } from "@/components/official/ProTextarea";
import { isUuidValue } from "@/components/official/entity-ref/doors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import {
  fetchAgentAppErrors,
  fetchAgentAppExecutions,
  resolveAgentAppError,
  unresolveAgentAppError,
  type AgentAppErrorRow,
  type AgentAppExecutionRow,
} from "@/lib/services/agent-apps-admin-service";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  ADMIN_AGENT_APPS_SURFACE_NAME,
  createAdminAgentAppsScope,
} from "@/features/surfaces/manifests/admin-agent-apps.manifest";
import {
  AgentAppRef,
  agentAppExecutionsHref,
} from "@/features/agent-apps/components/AgentAppRef";

const LIMIT = 500;
/** Both source calls order newest first and request only the newest 500; no total receipt exists. */
export const EXECUTIONS_COVERAGE = {
  noun: "execution",
  cap: LIMIT,
  answeredBy: "client" as const,
};
export const ERRORS_COVERAGE = {
  noun: "error",
  cap: LIMIT,
  answeredBy: "client" as const,
};
export function scopedAppId(rawAppId: string | null): string | null {
  return isUuidValue(rawAppId) ? rawAppId : null;
}

export function executionSourceFilters(
  appId: string | null,
  outcome: "all" | "success" | "failed",
) {
  return {
    app_id: appId ?? undefined,
    success: outcome === "all" ? undefined : outcome === "success",
    limit: LIMIT,
  };
}
export function errorSourceFilters(
  appId: string | null,
  resolved: "all" | "resolved" | "unresolved",
) {
  return {
    app_id: appId ?? undefined,
    resolved: resolved === "all" ? undefined : resolved === "resolved",
    limit: LIMIT,
  };
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  missing_variable: "Missing Variable",
  extra_variable: "Extra Variable",
  invalid_variable_type: "Invalid Variable Type",
  component_render_error: "Component Render Error",
  api_error: "API Error",
  rate_limit: "Rate Limit",
  other: "Other",
};
export function errorTypeFilterOptions(errorTypes: Iterable<string>) {
  const values = new Set(Object.keys(ERROR_TYPE_LABELS));
  for (const errorType of errorTypes) values.add(errorType);
  return [...values]
    .sort()
    .map((value) => ({ value, label: ERROR_TYPE_LABELS[value] ?? value }));
}

export function humanExecution(row: AgentAppExecutionRow) {
  return [
    `${row.app_name ?? row.app_id} — ${row.success === true ? "OK" : row.success === false ? "Failed" : "Pending"}`,
    `Task: ${row.task_id}`,
    row.error_message ? `Error: ${row.error_message}` : null,
    `Tokens: ${formatCount(row.tokens_used)} · Cost: ${formatUsd(row.cost, { digits: 4 })}`,
    row.execution_time_ms == null ? null : `Time: ${row.execution_time_ms}ms`,
    `When: ${new Date(row.created_at).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}
function humanError(row: AgentAppErrorRow) {
  return [
    `${row.app_name ?? row.app_id} — ${ERROR_TYPE_LABELS[row.error_type] ?? row.error_type}`,
    row.resolved ? "Resolved" : "Unresolved",
    row.error_message ? `Message: ${row.error_message}` : null,
    row.error_code ? `Code: ${row.error_code}` : null,
    row.resolution_notes ? `Resolution: ${row.resolution_notes}` : null,
    `When: ${new Date(row.created_at).toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}
function filterText(filter: ColumnFilterValue | undefined) {
  return filter?.kind === "text" ? filter.value : "";
}
export function executionSuccessFilter(
  query: MatrxDataTableQueryState,
): "all" | "success" | "failed" {
  const filter = query.columnFilters.success;
  return filter?.kind === "boolean"
    ? filter.value
      ? "success"
      : "failed"
    : "all";
}
export function errorResolvedFilter(
  query: MatrxDataTableQueryState,
): "all" | "resolved" | "unresolved" {
  const filter = query.columnFilters.resolved;
  return filter?.kind === "boolean"
    ? filter.value
      ? "resolved"
      : "unresolved"
    : "all";
}

const AppCell = ({
  id,
  name,
  slug,
}: {
  id: string;
  name?: string;
  slug?: string;
}) => <AgentAppRef appId={id} name={name} slug={slug} />;
export const EXECUTION_COLUMNS: MatrxColumnDef<AgentAppExecutionRow>[] = [
  {
    id: "success",
    header: "Outcome",
    accessorKey: "success",
    filter: "boolean",
    width: 105,
    cell: (row) =>
      row.success === true ? (
        <Badge variant="outline" className="border-success/40 text-success">
          <CheckCircle className="mr-1 h-3 w-3" />
          OK
        </Badge>
      ) : row.success === false ? (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Fail
        </Badge>
      ) : (
        <Badge variant="outline">Pending</Badge>
      ),
  },
  {
    id: "kind",
    header: "Kind",
    accessorKey: "kind",
    filter: "select",
    filterOptions: [
      { value: "visit", label: "Visit" },
      { value: "run", label: "Run" },
    ],
    width: 90,
  },
  {
    id: "app",
    header: "App",
    accessorFn: (row) => row.app_name ?? "",
    filter: "text",
    width: 190,
    cell: (row) => (
      <AppCell id={row.app_id} name={row.app_name} slug={row.app_slug} />
    ),
  },
  {
    id: "app-id",
    header: "App ID",
    accessorKey: "app_id",
    filter: "text",
    hidden: true,
    cell: (row) => (
      <MatrxUuidCell value={row.app_id} label="Agent app ID" token="app" />
    ),
  },
  {
    id: "app-slug",
    header: "App slug",
    accessorFn: (row) => row.app_slug ?? "",
    filter: "text",
    hidden: true,
  },
  {
    id: "id",
    header: "ID",
    accessorKey: "id",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (row) => <MatrxUuidCell value={row.id} label="Execution ID" />,
  },
  {
    id: "task",
    header: "Task",
    accessorKey: "task_id",
    filter: "text",
    width: 180,
    cell: (row) => (
      <MatrxUuidCell value={row.task_id} label="Client correlation ID" />
    ),
  },
  {
    id: "user-id",
    header: "User ID",
    accessorFn: (row) => row.user_id ?? "",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (row) => <MatrxUuidCell value={row.user_id} label="User ID" />,
  },
  {
    id: "fingerprint",
    header: "Fingerprint",
    accessorFn: (row) => row.fingerprint ?? "",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (row) => (
      <MatrxUuidCell value={row.fingerprint} label="Fingerprint" />
    ),
  },
  {
    id: "ip-address",
    header: "IP address",
    accessorFn: (row) => row.ip_address ?? "",
    filter: "text",
    width: 130,
    mobileHidden: true,
  },
  {
    id: "tokens",
    header: "Tokens",
    accessorFn: (row) => row.tokens_used ?? null,
    filter: "number",
    align: "right",
    width: 100,
    cell: (row) => formatCount(row.tokens_used),
  },
  {
    id: "cost",
    header: "Cost",
    accessorFn: (row) => row.cost ?? null,
    filter: "number",
    align: "right",
    width: 100,
    cell: (row) => formatUsd(row.cost, { digits: 4 }),
  },
  {
    id: "duration",
    header: "Time",
    accessorFn: (row) => row.execution_time_ms ?? null,
    filter: "number",
    align: "right",
    width: 110,
    cell: (row) =>
      row.execution_time_ms == null
        ? "—"
        : formatDurationMs(row.execution_time_ms, { style: "compact" }),
  },
  {
    id: "created",
    header: "When",
    accessorKey: "created_at",
    filter: "date",
    width: 175,
    cell: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.created_at).toLocaleString()}
      </span>
    ),
  },
];
export const ERROR_COLUMNS: MatrxColumnDef<AgentAppErrorRow>[] = [
  {
    id: "resolved",
    header: "Status",
    accessorKey: "resolved",
    filter: "boolean",
    width: 120,
    cell: (row) =>
      row.resolved ? (
        <Badge variant="outline" className="border-success/40 text-success">
          <CheckCircle className="mr-1 h-3 w-3" />
          Resolved
        </Badge>
      ) : (
        <Badge variant="destructive">
          <AlertCircle className="mr-1 h-3 w-3" />
          Open
        </Badge>
      ),
  },
  {
    id: "type",
    header: "Type",
    accessorKey: "error_type",
    filter: "select",
    filterOptions: errorTypeFilterOptions([]),
    width: 170,
    cell: (row) => (
      <Badge variant="outline" className="text-xs">
        {ERROR_TYPE_LABELS[row.error_type] ?? row.error_type}
      </Badge>
    ),
  },
  {
    id: "app",
    header: "App",
    accessorFn: (row) => row.app_name ?? "",
    filter: "text",
    width: 190,
    cell: (row) => (
      <AppCell id={row.app_id} name={row.app_name} slug={row.app_slug} />
    ),
  },
  {
    id: "app-id",
    header: "App ID",
    accessorKey: "app_id",
    filter: "text",
    hidden: true,
    cell: (row) => (
      <MatrxUuidCell value={row.app_id} label="Agent app ID" token="app" />
    ),
  },
  {
    id: "app-slug",
    header: "App slug",
    accessorFn: (row) => row.app_slug ?? "",
    filter: "text",
    hidden: true,
  },
  {
    id: "id",
    header: "ID",
    accessorKey: "id",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (row) => <MatrxUuidCell value={row.id} label="Error ID" />,
  },
  {
    id: "message",
    header: "Message",
    accessorKey: "error_message",
    filter: "text",
    width: 330,
  },
  {
    id: "code",
    header: "Code",
    accessorKey: "error_code",
    filter: "text",
    width: 130,
    mobileHidden: true,
  },
  {
    id: "execution",
    header: "Execution ID",
    accessorFn: (row) => row.execution_id ?? "",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (row) =>
      row.execution_id ? (
        <MatrxUuidCell value={row.execution_id} label="Execution ID" />
      ) : (
        "—"
      ),
  },
  {
    id: "created",
    header: "When",
    accessorKey: "created_at",
    filter: "date",
    width: 175,
    cell: (row) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.created_at).toLocaleString()}
      </span>
    ),
  },
];

export function errorColumns(errorTypes: Iterable<string>) {
  return ERROR_COLUMNS.map((column) =>
    column.id === "type"
      ? { ...column, filterOptions: errorTypeFilterOptions(errorTypes) }
      : column,
  );
}

function SurfaceScopeWhenActive({
  active,
  getScope,
  children,
}: {
  active: boolean;
  getScope: () => SurfaceScopePayload;
  children: React.ReactNode;
}) {
  return active ? (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AGENT_APPS_SURFACE_NAME}
      getScope={getScope}
    >
      {children}
    </SurfaceRuntimeProvider>
  ) : (
    <>{children}</>
  );
}

export default function AgentAppsExecutionsAdminPage() {
  return (
    <Suspense>
      <AgentAppsExecutionsContent />
    </Suspense>
  );
}

function AgentAppsExecutionsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const appId = scopedAppId(searchParams.get("app"));
  const [activeTab, setActiveTab] = useState<"executions" | "errors">(
    searchParams.get("tab") === "errors" ? "errors" : "executions",
  );
  const clearAppScope = () =>
    router.replace("/administration/agents/agent-apps/executions");
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-textured">
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "executions" | "errors")
          }
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="border-b border-border bg-card px-4">
            <TabsList className="h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="executions">
                <Activity className="mr-2 h-4 w-4" />
                Executions
              </TabsTrigger>
              <TabsTrigger value="errors">
                <AlertCircle className="mr-2 h-4 w-4" />
                Errors
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 p-4">
            {appId && (
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  Showing records for{" "}
                  <AgentAppRef appId={appId} alwaysShowActions />
                </span>
                <Button size="sm" variant="outline" onClick={clearAppScope}>
                  Show all apps
                </Button>
              </div>
            )}
            <TabsContent
              value="executions"
              className="m-0 h-full data-[state=active]:flex data-[state=active]:flex-col"
            >
              <ExecutionsTable
                active={activeTab === "executions"}
                appId={appId}
              />
            </TabsContent>
            <TabsContent
              value="errors"
              className="m-0 h-full data-[state=active]:flex data-[state=active]:flex-col"
            >
              <ErrorsTable active={activeTab === "errors"} appId={appId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function ExecutionsTable({
  active,
  appId,
}: {
  active: boolean;
  appId: string | null;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AgentAppExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewRows, setViewRows] = useState<AgentAppExecutionRow[]>([]);
  const tableQuery = useTableUrlState({
    tableId: "admin-agent-app-executions",
    defaultSort: { id: "created", direction: "desc" },
    defaultPageSize: 50,
  });
  const [outcome, setOutcome] = useState<"all" | "success" | "failed">("all");
  const load = async () => {
    const retain = rows.length > 0;
    retain ? setRefreshing(true) : setLoading(true);
    try {
      const data = await fetchAgentAppExecutions(
        executionSourceFilters(appId, outcome),
      );
      setRows(data);
      setViewRows(data);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load executions";
      setError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  const refreshSource = useEffectEvent(() => {
    void load();
  });
  useEffect(() => {
    const timer = window.setTimeout(refreshSource, 0);
    return () => window.clearTimeout(timer);
  }, [outcome, appId]);
  const stats = {
    total: rows.length,
    success: rows.filter((row) => row.success === true).length,
    failed: rows.filter((row) => row.success === false).length,
  };
  const scope = () =>
    createAdminAgentAppsScope({
      admin_section: "executions",
      executions_active_tab: "executions",
      executions_rows: viewRows.map((row) => ({
        success: row.success,
        app_name: row.app_name ?? null,
        app_slug: row.app_slug ?? null,
        task_id: row.task_id,
        user_id: row.user_id ?? null,
        fingerprint: row.fingerprint ?? null,
        ip_address: row.ip_address ?? null,
        tokens_used: row.tokens_used ?? null,
        cost: row.cost ?? null,
        execution_time_ms: row.execution_time_ms ?? null,
        created_at: row.created_at,
      })),
      executions_stats: stats,
      executions_app_filter: filterText(tableQuery.state.columnFilters.app),
      executions_success_filter: outcome,
      executions_app_id: appId ?? undefined,
      executions_table_query: { ...tableQuery.state },
    });
  return (
    <SurfaceScopeWhenActive active={active} getScope={scope}>
      <div
        className="flex min-h-0 flex-1 flex-col"
        aria-busy={loading || refreshing}
      >
        {error && <LoadError label="executions" error={error} retry={load} />}
        <Stats
          cards={[
            [stats.success, "Success loaded", "text-success"],
            [stats.failed, "Failed loaded", "text-destructive"],
          ]}
        />
        <div className="min-h-0 flex-1">
          <MatrxDataTable
            tableId="admin-agent-app-executions"
            query={{
              mode: "controlled-local",
              state: tableQuery.state,
              onStateChange: tableQuery.onStateChange,
            }}
            data={rows}
            columns={EXECUTION_COLUMNS}
            getRowId={(row) => row.id}
            isLoading={loading}
            isFetching={refreshing}
            stickyHeader
            pageSize={50}
            localPagination={{ mode: "progressive" }}
            coverage={EXECUTIONS_COVERAGE}
            toolbar={{
              title: "Executions",
              search: true,
              facets: [
                {
                  type: "button-group",
                  id: "source-outcome",
                  label: "Source outcome",
                  value: outcome,
                  defaultValue: "all",
                  options: [
                    { value: "all", label: "All" },
                    { value: "success", label: "Success" },
                    { value: "failed", label: "Failed" },
                  ],
                  onChange: (value) =>
                    setOutcome(value as "all" | "success" | "failed"),
                },
              ],
              searchPlaceholder: "Search executions…",
              refresh: { onRefresh: load },
            }}
            copy={{
              label: "Execution",
              listLabel: "Executions (this view)",
              location: "AI Matrx Admin — Agent Apps — Executions",
              rowKind: "agent-app-execution",
              listKind: "agent-app-executions",
              rowDescription: "A single agent-app execution row.",
              listDescription:
                "Recent executions currently shown after canonical table filters.",
              humanRow: humanExecution,
              agentRow: (row) => row,
              rowAttributes: (row) => ({ id: row.id, success: row.success }),
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
              title: error
                ? "Could not load executions."
                : "No executions match the current view.",
            }}
            onViewChange={setViewRows}
          />
        </div>
      </div>
    </SurfaceScopeWhenActive>
  );
}

function ErrorsTable({
  active,
  appId,
}: {
  active: boolean;
  appId: string | null;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AgentAppErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewRows, setViewRows] = useState<AgentAppErrorRow[]>([]);
  const [selected, setSelected] = useState<AgentAppErrorRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const tableQuery = useTableUrlState({
    tableId: "admin-agent-app-errors",
    defaultSort: { id: "created", direction: "desc" },
    defaultPageSize: 50,
  });
  const [resolved, setResolved] = useState<"all" | "resolved" | "unresolved">(
    "unresolved",
  );
  const load = async () => {
    const retain = rows.length > 0;
    retain ? setRefreshing(true) : setLoading(true);
    try {
      const data = await fetchAgentAppErrors(
        errorSourceFilters(appId, resolved),
      );
      setRows(data);
      setViewRows(data);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load errors";
      setError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  const refreshSource = useEffectEvent(() => {
    void load();
  });
  useEffect(() => {
    const timer = window.setTimeout(refreshSource, 0);
    return () => window.clearTimeout(timer);
  }, [resolved, appId]);
  const stats = {
    total: rows.length,
    resolved: rows.filter((row) => row.resolved).length,
    unresolved: rows.filter((row) => !row.resolved).length,
  };
  const open = (row: AgentAppErrorRow) => {
    setSelected(row);
    setResolutionNotes(row.resolution_notes ?? "");
  };
  const resolve = async () => {
    if (!selected) return;
    try {
      await resolveAgentAppError({
        id: selected.id,
        resolution_notes: resolutionNotes,
      });
      setSelected(null);
      await load();
      toast({ title: "Resolved", description: "Error marked resolved" });
    } catch (cause) {
      toast({
        title: "Error",
        description:
          cause instanceof Error ? cause.message : "Failed to resolve error",
        variant: "destructive",
      });
    }
  };
  const unresolve = async () => {
    if (!selected) return;
    try {
      await unresolveAgentAppError(selected.id);
      setSelected(null);
      await load();
      toast({ title: "Unresolved", description: "Error re-opened" });
    } catch (cause) {
      toast({
        title: "Error",
        description:
          cause instanceof Error ? cause.message : "Failed to unresolve error",
        variant: "destructive",
      });
    }
  };
  const scope = () =>
    createAdminAgentAppsScope({
      admin_section: "executions",
      executions_active_tab: "errors",
      errors_rows: viewRows.map((row) => ({
        resolved: row.resolved,
        error_type: row.error_type,
        app_name: row.app_name ?? null,
        app_slug: row.app_slug ?? null,
        error_message: row.error_message ?? null,
        created_at: row.created_at,
      })),
      errors_stats: stats,
      errors_resolved_filter: resolved,
      executions_app_id: appId ?? undefined,
      errors_table_query: { ...tableQuery.state },
      selected_error: selected
        ? {
            resolved: selected.resolved,
            error_type: selected.error_type,
            app_name: selected.app_name ?? null,
            app_slug: selected.app_slug ?? null,
            error_message: selected.error_message ?? null,
            created_at: selected.created_at,
            error_code: selected.error_code ?? null,
            variables_sent: selected.variables_sent,
            expected_variables: selected.expected_variables,
            error_details: selected.error_details,
          }
        : undefined,
    });
  return (
    <SurfaceScopeWhenActive active={active} getScope={scope}>
      <div
        className="flex min-h-0 flex-1 flex-col"
        aria-busy={loading || refreshing}
      >
        {error && <LoadError label="errors" error={error} retry={load} />}
        <Stats
          cards={[
            [stats.unresolved, "Unresolved loaded", "text-destructive"],
            [stats.resolved, "Resolved loaded", "text-success"],
          ]}
        />
        <div className="min-h-0 flex-1">
          <MatrxDataTable
            tableId="admin-agent-app-errors"
            query={{
              mode: "controlled-local",
              state: tableQuery.state,
              onStateChange: tableQuery.onStateChange,
            }}
            data={rows}
            columns={errorColumns(rows.map((row) => row.error_type))}
            getRowId={(row) => row.id}
            isLoading={loading}
            isFetching={refreshing}
            stickyHeader
            pageSize={50}
            localPagination={{ mode: "progressive" }}
            coverage={ERRORS_COVERAGE}
            toolbar={{
              title: "Errors",
              search: true,
              facets: [
                {
                  type: "button-group",
                  id: "source-status",
                  label: "Source status",
                  value: resolved,
                  defaultValue: "unresolved",
                  options: [
                    { value: "all", label: "All" },
                    { value: "unresolved", label: "Unresolved" },
                    { value: "resolved", label: "Resolved" },
                  ],
                  onChange: (value) =>
                    setResolved(value as "all" | "resolved" | "unresolved"),
                },
              ],
              searchPlaceholder: "Search errors…",
              refresh: { onRefresh: load },
            }}
            copy={{
              label: "Error",
              listLabel: "Errors (this view)",
              location: "AI Matrx Admin — Agent Apps — Errors",
              rowKind: "agent-app-error",
              listKind: "agent-app-errors",
              rowDescription: "A single agent-app error row.",
              listDescription:
                "Errors currently shown after canonical table filters.",
              humanRow: humanError,
              agentRow: (row) => row,
              rowAttributes: (row) => ({ id: row.id, resolved: row.resolved }),
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
              title: error
                ? "Could not load errors."
                : "No errors match the current view.",
            }}
            onViewChange={setViewRows}
            onRowOpen={open}
            rowActions={(row) => (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <MoreHorizontalTapButton
                      ariaLabel={`Actions for ${row.error_type}`}
                      variant="transparent"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open(row)}>
                      View and manage
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          />
        </div>
        <ErrorDialog
          selected={selected}
          notes={resolutionNotes}
          setNotes={setResolutionNotes}
          close={() => setSelected(null)}
          resolve={resolve}
          unresolve={unresolve}
        />
      </div>
    </SurfaceScopeWhenActive>
  );
}

function Stats({ cards }: { cards: Array<[number, string, string?]> }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 pb-3">
      {cards.map(([value, label, color]) => (
        <Card key={label}>
          <CardContent className="p-2">
            <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function LoadError({
  label,
  error,
  retry,
}: {
  label: string;
  error: string;
  retry: () => Promise<void>;
}) {
  return (
    <div
      role="alert"
      className="mb-2 flex shrink-0 items-center gap-2 text-sm text-red-600 dark:text-red-400"
    >
      Could not refresh {label}: {error}
      <button type="button" className="underline" onClick={() => void retry()}>
        Retry
      </button>
    </div>
  );
}
function ErrorDialog({
  selected,
  notes,
  setNotes,
  close,
  resolve,
  unresolve,
}: {
  selected: AgentAppErrorRow | null;
  notes: string;
  setNotes: (value: string) => void;
  close: () => void;
  resolve: () => Promise<void>;
  unresolve: () => Promise<void>;
}) {
  return (
    <Dialog open={!!selected} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected?.resolved ? (
              <CheckCircle className="h-5 w-5 text-success" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            Error Details
            {selected && (
              <CopyButtons
                size="icon"
                label={`Error ${selected.id}`}
                className="ml-auto"
                human={() => humanError(selected)}
                json={() => selected}
                agent={() => ({
                  kind: "agent-app-error",
                  location: "AI Matrx Admin — Agent Apps — Errors",
                  description:
                    "The agent-app error record open in this dialog.",
                  data: selected,
                  summary: humanError(selected),
                  attributes: { id: selected.id, resolved: selected.resolved },
                })}
              />
            )}
          </DialogTitle>
          <DialogDescription>Review and manage this error</DialogDescription>
        </DialogHeader>
        {selected && (
          <div className="space-y-4">
            <div>
              <Label>Error Type</Label>
              <div className="mt-1">
                <Badge variant="outline">
                  {ERROR_TYPE_LABELS[selected.error_type] ??
                    selected.error_type}
                </Badge>
              </div>
            </div>
            <div>
              <Label>Message</Label>
              <p className="mt-1 text-sm">
                {selected.error_message ?? "No error message"}
              </p>
            </div>
            {selected.error_code && (
              <div>
                <Label>Error Code</Label>
                <code className="mt-1 block rounded bg-muted px-2 py-1 text-sm">
                  {selected.error_code}
                </code>
              </div>
            )}
            <div>
              <Label>App</Label>
              <div className="mt-1">
                <AppCell
                  id={selected.app_id}
                  name={selected.app_name}
                  slug={selected.app_slug}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="text-sm text-primary hover:underline"
                href={agentAppExecutionsHref(selected.app_id)}
              >
                All runs for this app
              </a>
              <a
                className="text-sm text-primary hover:underline"
                href={`${agentAppExecutionsHref(selected.app_id)}&tab=errors`}
              >
                All errors for this app
              </a>
            </div>
            <div>
              <Label>Variables Sent</Label>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(selected.variables_sent, null, 2)}
              </pre>
            </div>
            <div>
              <Label>Expected Variables</Label>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(selected.expected_variables, null, 2)}
              </pre>
            </div>
            {Object.keys(selected.error_details ?? {}).length > 0 && (
              <div>
                <Label>Error Details</Label>
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(selected.error_details, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <Label>Created At</Label>
              <p className="mt-1 text-sm">
                {new Date(selected.created_at).toLocaleString()}
              </p>
            </div>
            {!selected.resolved && (
              <div>
                <Label htmlFor="resolution-notes">Resolution Notes</Label>
                <ProTextarea
                  id="resolution-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add notes about how this was resolved..."
                  rows={4}
                  className="mt-1 text-[16px]"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={close}>
                Close
              </Button>
              {selected.resolved ? (
                <Button variant="outline" onClick={() => void unresolve()}>
                  <XCircle className="mr-1 h-4 w-4" />
                  Mark Unresolved
                </Button>
              ) : (
                <Button onClick={() => void resolve()}>
                  <CheckCircle className="mr-1 h-4 w-4" />
                  Mark Resolved
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
