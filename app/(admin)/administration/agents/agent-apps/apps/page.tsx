"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle, Clock, Archive } from "lucide-react";
import { MoreHorizontalTapButton } from "@ai-matrx/tap-target/buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import type {
  ColumnFilterValue,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import {
  formatCount,
  formatPercentFromFraction,
  formatUsd,
} from "@ai-matrx/kit/format";
import {
  fetchAgentAppsAdmin,
  updateAgentAppAdmin,
  type AgentAppAdminView,
  type UpdateAgentAppAdminInput,
} from "@/lib/services/agent-apps-admin-service";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_AGENT_APPS_SURFACE_NAME,
  createAdminAgentAppsScope,
} from "@/features/surfaces/manifests/admin-agent-apps.manifest";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { appBrief, humanAgentApp } from "@/features/agent-apps/format";
import {
  AgentAppRef,
  agentAppExecutionsHref,
} from "@/features/agent-apps/components/AgentAppRef";
import { pushAppHref } from "@/lib/deployment/navigate";

/** `fetchAgentAppsAdmin({limit: 1000})` has no total-count receipt. */
export const AGENT_APPS_COVERAGE = {
  noun: "agent app",
  cap: 1000,
  answeredBy: "client" as const,
};

function getStatusBadge(status: string) {
  const map: Record<string, { cls: string; Icon: typeof Clock }> = {
    draft: { cls: "bg-muted text-foreground", Icon: Clock },
    published: {
      cls: "bg-success/15 text-success border-success/30",
      Icon: CheckCircle,
    },
    archived: {
      cls: "bg-muted text-muted-foreground border-border",
      Icon: Archive,
    },
    suspended: {
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      Icon: Ban,
    },
  };
  const config = map[status] ?? map.draft;
  const Icon = config.Icon;
  return (
    <Badge variant="outline" className={`${config.cls} text-xs`}>
      <Icon className="mr-1 h-3 w-3" />
      {status}
    </Badge>
  );
}

export function agentAppSuccessPercent(value: number | null): number | null {
  return value === null ? null : value * 100;
}

function textFilterValue(filter: ColumnFilterValue | undefined): string {
  return filter?.kind === "text" ? filter.value : "";
}

function selectedValues(filter: ColumnFilterValue | undefined): string[] {
  if (filter?.kind !== "select") return [];
  return filter.values ?? (filter.value ? [filter.value] : []);
}

export function agentAppsScopeFilters(query: MatrxDataTableQueryState) {
  const featured = query.columnFilters.featured;
  const verified = query.columnFilters.verified;
  return {
    name: textFilterValue(query.columnFilters.name),
    slug: textFilterValue(query.columnFilters.slug),
    status: selectedValues(query.columnFilters.status),
    category: selectedValues(query.columnFilters.category),
    featured:
      featured?.kind === "boolean"
        ? featured.value
          ? "featured"
          : "not-featured"
        : "all",
    verified:
      verified?.kind === "boolean"
        ? verified.value
          ? "verified"
          : "not-verified"
        : "all",
    creator: textFilterValue(query.columnFilters.creator),
  } as const;
}

export const AGENT_APP_COLUMNS: MatrxColumnDef<AgentAppAdminView>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    filter: "text",
    width: 220,
    cell: (app) => (
      <AgentAppRef appId={app.id} name={app.name} slug={app.slug} />
    ),
  },
  {
    id: "id",
    header: "ID",
    accessorKey: "id",
    filter: "text",
    width: 160,
    mobileHidden: true,
    cell: (app) => <MatrxUuidCell value={app.id} label="Agent app ID" />,
  },
  {
    id: "slug",
    header: "Slug",
    accessorKey: "slug",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (app) => (
      <code
        className="block truncate rounded bg-muted px-2 py-1 text-xs"
        title={app.slug}
      >
        {app.slug}
      </code>
    ),
  },
  {
    id: "mandate",
    header: "Mandate",
    accessorFn: (app) => app.mandate_key ?? "",
    filter: "text",
    width: 180,
    mobileHidden: true,
    cell: (app) =>
      app.mandate_key ? (
        <AppLink
          href={`/mandates/${encodeURIComponent(app.mandate_key)}`}
          className="block truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          title="Open this app's mandate"
        >
          {app.mandate_key}
        </AppLink>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
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
    width: 140,
    cell: (app) => getStatusBadge(app.status),
  },
  {
    id: "category",
    header: "Category",
    accessorFn: (app) => app.category ?? "",
    filter: "select",
    width: 130,
    mobileHidden: true,
    cell: (app) =>
      app.category ? (
        <Badge variant="outline" className="text-xs">
          {app.category}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: "creator",
    header: "Creator",
    accessorFn: (app) => app.creator_email ?? "",
    filter: "text",
    width: 180,
    mobileHidden: true,
    cell: (app) => (
      <span
        className="block truncate text-sm text-muted-foreground"
        title={app.creator_email}
      >
        {app.creator_email ?? "—"}
      </span>
    ),
  },
  {
    id: "featured",
    header: "Featured",
    accessorKey: "is_featured",
    filter: "boolean",
    width: 110,
    mobileHidden: true,
  },
  {
    id: "verified",
    header: "Verified",
    accessorKey: "is_verified",
    filter: "boolean",
    width: 110,
    mobileHidden: true,
  },
  {
    id: "executions",
    header: "Runs",
    accessorKey: "total_executions",
    filter: "number",
    width: 100,
    className: "text-right tabular-nums",
    cell: (app) => (
      <AppLink
        href={agentAppExecutionsHref(app.id)}
        title={`Open the runs and errors for ${app.name}`}
        className="hover:text-primary hover:underline"
      >
        {formatCount(app.total_executions)}
      </AppLink>
    ),
  },
  {
    id: "users",
    header: "Users",
    accessorKey: "unique_users_count",
    filter: "number",
    width: 80,
    className: "text-right tabular-nums",
    mobileHidden: true,
    cell: (app) => formatCount(app.unique_users_count),
  },
  {
    id: "success-rate",
    header: "Success",
    accessorFn: (app) => agentAppSuccessPercent(app.success_rate),
    filter: "number",
    width: 100,
    className: "text-right tabular-nums",
    mobileHidden: true,
    cell: (app) => formatPercentFromFraction(app.success_rate),
  },
  {
    id: "cost",
    header: "Cost",
    accessorKey: "total_cost",
    filter: "number",
    width: 90,
    className: "text-right tabular-nums",
    mobileHidden: true,
    cell: (app) => formatUsd(app.total_cost, { digits: 4 }),
  },
  {
    id: "updated",
    header: "Updated",
    accessorKey: "updated_at",
    filter: "date",
    width: 130,
    mobileHidden: true,
    cell: (app) => (
      <time className="text-xs text-muted-foreground" dateTime={app.updated_at}>
        {new Date(app.updated_at).toLocaleDateString()}
      </time>
    ),
  },
  {
    id: "description",
    header: "Description",
    accessorFn: (app) => app.description ?? "",
    filter: "text",
    hidden: true,
  },
  {
    id: "tags",
    header: "Tags",
    accessorFn: (app) => app.tags.join(" "),
    filter: "text",
    hidden: true,
  },
  {
    id: "visibility",
    header: "Visibility",
    accessorKey: "visibility",
    filter: "select",
    hidden: true,
  },
];

export default function AgentAppsAdminListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewApps, setViewApps] = useState<AgentAppAdminView[]>([]);
  const tableQuery = useTableUrlState({
    tableId: "admin-agent-apps",
    defaultSort: { id: "updated", direction: "desc" },
    defaultPageSize: 50,
  });

  const load = async () => {
    const retainsRows = apps.length > 0;
    try {
      if (retainsRows) setIsRefreshing(true);
      else setLoading(true);
      const data = await fetchAgentAppsAdmin({ limit: 1000 });
      setApps(data);
      setViewApps(data);
      setLoadError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load agent apps";
      setLoadError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };
  const startLoad = useEffectEvent(() => {
    void load();
  });
  useEffect(() => {
    const timer = window.setTimeout(startLoad, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleApps = viewApps;
  const stats = {
    total: apps.length,
    published: apps.filter((app) => app.status === "published").length,
    featured: apps.filter((app) => app.is_featured).length,
    verified: apps.filter((app) => app.is_verified).length,
  };
  const handleOpenEdit = (id: string) =>
    startTransition(() =>
      pushAppHref(router, `/administration/agents/agent-apps/edit/${id}`),
    );
  const handleMutate = async (
    id: string,
    patch: Omit<UpdateAgentAppAdminInput, "id">,
    description: string,
  ) => {
    try {
      await updateAgentAppAdmin({ id, ...patch });
      await load();
      toast({ title: "Updated", description });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update agent app",
        variant: "destructive",
      });
    }
  };
  const getScope = () =>
    createAdminAgentAppsScope({
      admin_section: "apps",
      apps_list_total_count: apps.length,
      apps_list_filtered_count: visibleApps.length,
      apps_list_filters: agentAppsScopeFilters(tableQuery.state),
      apps_list_table_query: { ...tableQuery.state },
      apps_list_sort: {
        field: tableQuery.state.sort?.id ?? "",
        direction: tableQuery.state.sort?.direction ?? "desc",
      },
      apps_list_rows: visibleApps.map((app) => ({
        id: app.id,
        name: app.name,
        slug: app.slug,
        status: app.status,
        category: app.category,
        creator_email: app.creator_email,
        is_featured: app.is_featured,
        is_verified: app.is_verified,
        total_executions: app.total_executions,
        unique_users_count: app.unique_users_count,
        success_rate: app.success_rate,
        total_cost: app.total_cost,
        updated_at: app.updated_at,
      })),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AGENT_APPS_SURFACE_NAME}
      getScope={getScope}
    >
      <TooltipProvider>
        <div
          className="flex h-full min-h-0 flex-col"
          aria-busy={loading || isRefreshing}
        >
          {loadError && (
            <div
              role="alert"
              className="mb-2 flex shrink-0 items-center gap-2 text-sm text-red-600 dark:text-red-400"
            >
              Could not refresh agent apps: {loadError}
              <button
                type="button"
                className="underline"
                onClick={() => void load()}
              >
                Retry
              </button>
            </div>
          )}
          <div className="grid shrink-0 grid-cols-4 gap-3 pb-3">
            {[
              [stats.total, "Loaded", ""],
              [stats.published, "Published loaded", "text-success"],
              [stats.featured, "Featured loaded", "text-warning"],
              [stats.verified, "Verified loaded", "text-primary"],
            ].map(([value, label, color]) => (
              <Card key={String(label)}>
                <CardContent className="p-2">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <MatrxDataTable<AgentAppAdminView>
              tableId="admin-agent-apps"
              query={{
                mode: "controlled-local",
                state: tableQuery.state,
                onStateChange: tableQuery.onStateChange,
              }}
              data={apps}
              columns={AGENT_APP_COLUMNS}
              getRowId={(app) => app.id}
              isLoading={loading}
              isFetching={isRefreshing}
              toolbar={{
                title: "Agent Apps",
                searchPlaceholder: "Search agent apps…",
                refresh: { onRefresh: load },
                actions:
                  visibleApps.length > 0 ? (
                    <CopyButtons
                      size="icon"
                      label={`Agent apps (${visibleApps.length})`}
                      human={() => visibleApps.map(humanAgentApp).join("\n\n")}
                      json={() => visibleApps}
                      agent={() => ({
                        kind: "agent-apps",
                        location: "AI Matrx Admin — Agent Apps",
                        description:
                          "Every agent app currently shown in the admin table (this view).",
                        data: visibleApps,
                        attributes: {
                          count: visibleApps.length,
                          totalCount: apps.length,
                        },
                      })}
                      aiVariants={[
                        {
                          id: "briefs",
                          label: "This view briefs",
                          hint: "One line per app currently shown",
                          build: () => ({
                            kind: "agent-apps-briefs",
                            location: "AI Matrx Admin — Agent Apps",
                            description:
                              "One-line briefs for the apps currently shown.",
                            data: visibleApps.map(appBrief),
                            attributes: { count: visibleApps.length },
                          }),
                        },
                      ]}
                      aiCustom={{
                        label: "Custom export…",
                        hint: "Toggle only-filtered-view / include description",
                        options: [
                          {
                            kind: "toggle",
                            key: "onlyFiltered",
                            label: "Only this view",
                            hint: "Off = every loaded app (up to 1000)",
                            default: true,
                          },
                          {
                            kind: "toggle",
                            key: "includeDescription",
                            label: "Include description",
                            hint: "Adds each app's full description text",
                            default: false,
                          },
                        ],
                        build: (options) => {
                          const source = options.onlyFiltered
                            ? visibleApps
                            : apps;
                          return {
                            text: source
                              .map((app) =>
                                [
                                  appBrief(app),
                                  options.includeDescription && app.description
                                    ? `  ${app.description}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join("\n"),
                              )
                              .join("\n\n"),
                            meta: { apps: source.length },
                          };
                        },
                        wrap: (text, options, meta) => ({
                          kind: "agent-apps-custom-export",
                          location: "AI Matrx Admin — Agent Apps",
                          description:
                            "Custom-groomed export of the admin agent-apps table.",
                          data: text,
                          attributes: {
                            onlyFiltered: Boolean(options.onlyFiltered),
                            includeDescription: Boolean(
                              options.includeDescription,
                            ),
                            count: meta?.apps,
                          },
                        }),
                      }}
                      export={{
                        items: [
                          jsonExportItem(() => visibleApps, "JSON (this view)"),
                          csvExportItem(
                            () =>
                              visibleApps as unknown as Array<
                                Record<string, unknown>
                              >,
                            "CSV (this view)",
                          ),
                        ],
                      }}
                    />
                  ) : undefined,
              }}
              onViewChange={setViewApps}
              coverage={AGENT_APPS_COVERAGE}
              detail={{ enabled: false }}
              window={{ enabled: false }}
              copy={false}
              getRowHref={(app) =>
                `/administration/agents/agent-apps/edit/${app.id}`
              }
              onRowOpen={(app) => handleOpenEdit(app.id)}
              emptyState={{
                title: loadError
                  ? "Could not load agent apps."
                  : "No agent apps found",
              }}
              rowActions={(app) => (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <MoreHorizontalTapButton
                        ariaLabel={`Actions for ${app.name}`}
                        variant="transparent"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleOpenEdit(app.id)}>
                        Manage
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void handleMutate(
                            app.id,
                            { is_featured: !app.is_featured },
                            `${app.name} ${!app.is_featured ? "featured" : "unfeatured"}`,
                          )
                        }
                      >
                        {app.is_featured
                          ? "Remove from featured"
                          : "Feature app"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void handleMutate(
                            app.id,
                            { is_verified: !app.is_verified },
                            `${app.name} ${!app.is_verified ? "verified" : "unverified"}`,
                          )
                        }
                      >
                        {app.is_verified ? "Remove verification" : "Verify app"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <CopyButtons
                    size="icon"
                    label={app.name}
                    human={() => humanAgentApp(app)}
                    json={() => app}
                    agent={() => ({
                      kind: "agent-app",
                      location: "AI Matrx Admin — Agent Apps",
                      description: "A single agent-app admin row.",
                      data: app,
                      summary: humanAgentApp(app),
                      attributes: { id: app.id, status: app.status },
                    })}
                  />
                </>
              )}
            />
          </div>
        </div>
      </TooltipProvider>
    </SurfaceRuntimeProvider>
  );
}
