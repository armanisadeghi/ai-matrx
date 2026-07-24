"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Database,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBacklinksScope } from "@/features/surfaces/manifests/marketing-backlinks.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  backlinkKeys,
  useBacklinkTrend,
  useBacklinkWorkspace,
  useLatestBacklinks,
} from "@/features/marketing/data/backlinks-hooks";
import { BacklinkTrendChart } from "@/features/marketing/components/backlinks/BacklinkTrendChart";
import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
} from "@/features/marketing/data/backlinks-types";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  buildSiteIntegrations,
  parseSiteIntegrations,
  validateSiteIntegrations,
  type DataForSeoCadence,
} from "@/features/marketing/data/integrations-schema";
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  refreshSiteBacklinks,
  SeoApiError,
} from "@/features/seo/dataforseo/client";
import type {
  BacklinkRefreshProfile,
  BacklinkRefreshReceipt,
} from "@/features/seo/dataforseo/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectApiServiceTargets } from "@/lib/redux/slices/apiConfigSlice";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

function compactNumber(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof SeoApiError) {
    return typeof error.detail === "string"
      ? error.detail
      : JSON.stringify(error.detail);
  }
  return error instanceof Error ? error.message : String(error);
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null | undefined;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {compactNumber(value)}
      </p>
      {detail ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function DimensionList({
  title,
  rows,
}: {
  title: string;
  rows: BacklinkDimensionRow[];
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold">{title}</h2>
        <span className="text-[10px] text-muted-foreground">
          top {Math.min(rows.length, 8)}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.slice(0, 8).map((row) => (
          <div
            key={row.id}
            className="flex min-w-0 items-center justify-between gap-3 text-[11px]"
          >
            <span className="truncate" title={row.label ?? row.dimension_key}>
              {row.label ?? row.dimension_key}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {compactNumber(row.backlinks ?? row.referring_domains)}
            </span>
          </div>
        ))}
        {!rows.length ? (
          <p className="text-[11px] text-muted-foreground">
            No stored rows yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function BacklinksWorkspace() {
  const { site } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const serviceTargets = useAppSelector(selectApiServiceTargets);
  const seoTarget = serviceTargets.find((target) => target.service === "seo");
  const table = useMarketingTableState({
    defaultSort: { id: "domain_rank", direction: "desc" },
    defaultPageSize: 50,
  });
  const workspace = useBacklinkWorkspace(site.id);
  const trend = useBacklinkTrend(site.id);
  const backlinks = useLatestBacklinks(site.id, table.queryState);
  const [profile, setProfile] = useState<BacklinkRefreshProfile>("bootstrap");
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState<BacklinkRefreshReceipt | null>(null);
  const savedSchedule = useMemo(
    () => parseSiteIntegrations(site.integrations).dataForSeo,
    [site.integrations],
  );
  const [schedule, setSchedule] = useState(savedSchedule);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleDirty =
    JSON.stringify(schedule) !== JSON.stringify(savedSchedule);
  const detailLimitValid =
    Number.isInteger(schedule.detailLimit) &&
    schedule.detailLimit >= 1 &&
    schedule.detailLimit <= 1000;

  const saveSchedule = async () => {
    const draft = parseSiteIntegrations(site.integrations);
    draft.dataForSeo = schedule;
    const issues = validateSiteIntegrations(draft);
    if (issues.length) {
      toast.error(issues[0].message);
      return;
    }
    setSavingSchedule(true);
    try {
      const updated = await updateSiteIntegrations({
        siteId: site.id,
        expectedVersion: site.version,
        integrations: buildSiteIntegrations(site.integrations, draft),
      });
      queryClient.setQueryData(marketingKeys.site(site.id), updated);
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
      toast.success(
        schedule.enabled
          ? `Automatic ${schedule.cadence} backlink refresh enabled.`
          : "Automatic backlink refresh disabled.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingSchedule(false);
    }
  };

  const refresh = async () => {
    if (!seoTarget?.url) {
      toast.error("No SEO server is configured for the selected environment.");
      return;
    }
    setRefreshing(true);
    try {
      const session = await supabase.auth.getSession();
      if (session.error) throw session.error;
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Sign in before refreshing backlink data.");
      const nextReceipt = await refreshSiteBacklinks(
        seoTarget.url,
        token,
        site.id,
        {
          organization_id: site.organization_id,
          profile,
          detail_limit: schedule.detailLimit,
          force_refresh: true,
          request_id: crypto.randomUUID(),
        },
      );
      setReceipt(nextReceipt);
      await queryClient.invalidateQueries({
        queryKey: backlinkKeys.workspace(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: backlinkKeys.trend(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: [
          ...backlinkKeys.workspace(site.id).slice(0, -1),
          "observations",
        ],
      });
      toast.success(`Backlink ${profile} refresh completed.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  if (workspace.isLoading) {
    return <LoadingSurface label="Loading backlink intelligence…" />;
  }
  if (workspace.isError) {
    return (
      <QueryError
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  }

  const data = workspace.data;
  const summary = data?.latestByDataset.summary;
  const detailSnapshot = data?.latestByDataset.backlinks;
  const columns: MatrxColumnDef<BacklinkObservationRow>[] = [
    {
      id: "source_domain",
      accessorKey: "source_domain",
      header: "Source domain",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block min-w-40 max-w-64 truncate font-medium">
          {row.source_domain ?? "—"}
        </span>
      ),
    },
    {
      id: "source_url",
      accessorKey: "source_url",
      header: "Source URL",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <a
          href={row.source_url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-56 max-w-xl items-center gap-1 truncate font-mono text-[11px] text-primary"
        >
          <span className="truncate">{row.source_url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ),
    },
    {
      id: "anchor_text",
      accessorKey: "anchor_text",
      header: "Anchor",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-52 truncate text-xs">
          {row.anchor_text || "—"}
        </span>
      ),
    },
    {
      id: "state",
      accessorKey: "state",
      header: "State",
      filter: "select",
      filterOptions: [
        { value: "active", label: "Active" },
        { value: "new", label: "New" },
        { value: "lost", label: "Lost" },
      ],
      cell: (row) => <StatusBadge value={row.state} />,
    },
    {
      id: "is_dofollow",
      accessorKey: "is_dofollow",
      header: "Follow",
      filter: "boolean",
      cell: (row) => (
        <span className="text-xs">
          {row.is_dofollow ? "dofollow" : "nofollow"}
        </span>
      ),
    },
    {
      id: "domain_rank",
      accessorKey: "domain_rank",
      header: "Domain rank",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{row.domain_rank ?? "—"}</span>
      ),
    },
    {
      id: "last_seen_at",
      accessorKey: "last_seen_at",
      header: "Last seen",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {row.last_seen_at ? formatCompactDate(row.last_seen_at) : "—"}
        </span>
      ),
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-backlinks"
      surfaceLabel="Backlinks"
      getScope={() =>
        createMarketingBacklinksScope({
          ...getBaseValues(),
          // Explicit KPI object — never the raw provider payload.
          backlink_summary: summary
            ? {
                total_backlinks: summary.total_backlinks,
                referring_domains: summary.referring_domains,
                dofollow_backlinks: summary.dofollow_backlinks,
                nofollow_backlinks: summary.nofollow_backlinks,
                rank_score: summary.rank_score,
                collected_at: summary.created_at,
              }
            : undefined,
          top_referring_domains: data?.referringDomains
            .slice(0, 15)
            .map((row) => ({
              domain: row.label ?? row.dimension_key,
              backlinks: row.backlinks,
              referring_domains: row.referring_domains,
            })),
          top_anchors: data?.anchors.slice(0, 15).map((row) => ({
            anchor: row.label ?? row.dimension_key,
            backlinks: row.backlinks,
          })),
        })
      }
    >
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3 sm:p-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-primary" /> Backlink intelligence
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            DataForSEO evidence stored for {site.domain}. Manual refresh follows
            the shell&apos;s {seoTarget?.environment ?? "selected"} SEO server
            target.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={profile}
            onValueChange={(value) =>
              setProfile(value as BacklinkRefreshProfile)
            }
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly core</SelectItem>
              <SelectItem value="monthly">Monthly detail</SelectItem>
              <SelectItem value="bootstrap">Full bootstrap</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={refreshing || !detailLimitValid}
            onClick={() => void refresh()}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh now
          </Button>
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="mr-auto min-w-64">
          <div className="flex items-center gap-2">
            <Switch
              aria-label="Enable automatic backlink refresh"
              checked={schedule.enabled}
              onCheckedChange={(enabled) =>
                setSchedule((current) => ({ ...current, enabled }))
              }
            />
            <div>
              <h2 className="text-xs font-semibold">Automatic refresh</h2>
              <p className="text-[10px] text-muted-foreground">
                Stored on this site; the aidream scheduler checks due sites
                daily.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Cadence</Label>
          <Select
            value={schedule.cadence}
            onValueChange={(cadence) =>
              setSchedule((current) => ({
                ...current,
                cadence: cadence as DataForSeoCadence,
              }))
            }
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="backlink-detail-limit" className="text-[10px]">
            Detail rows
          </Label>
          <Input
            id="backlink-detail-limit"
            type="number"
            min={1}
            max={1000}
            value={schedule.detailLimit}
            className="h-8 w-28"
            onChange={(event) =>
              setSchedule((current) => ({
                ...current,
                detailLimit: Number(event.target.value),
              }))
            }
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!scheduleDirty || savingSchedule || !detailLimitValid}
          onClick={() => void saveSchedule()}
        >
          {savingSchedule ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save schedule
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <MetricCard label="Backlinks" value={summary?.total_backlinks} />
        <MetricCard
          label="Referring domains"
          value={summary?.referring_domains}
        />
        <MetricCard label="Dofollow" value={summary?.dofollow_backlinks} />
        <MetricCard label="Nofollow" value={summary?.nofollow_backlinks} />
        <MetricCard label="Rank" value={summary?.rank_score} />
        <MetricCard
          label="Last refreshed"
          value={null}
          detail={
            summary ? formatCompactDate(summary.created_at) : "No snapshot yet"
          }
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold">
              New vs. lost backlinks over time
            </h2>
            <p className="text-[10px] text-muted-foreground">
              From the stored DataForSEO backlink timeseries — no re-fetch
              required once a weekly or bootstrap refresh has run.
            </p>
          </div>
        </div>
        {trend.isLoading ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            Loading trend…
          </div>
        ) : trend.isError ? (
          <QueryError error={trend.error} onRetry={() => void trend.refetch()} />
        ) : (
          <BacklinkTrendChart points={trend.data ?? []} />
        )}
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <DimensionList
          title="Referring domains"
          rows={data?.referringDomains ?? []}
        />
        <DimensionList title="Anchor text" rows={data?.anchors ?? []} />
        <DimensionList title="Linked pages" rows={data?.targetPages ?? []} />
        <DimensionList title="Competitors" rows={data?.competitors ?? []} />
      </section>

      {receipt ? (
        <section className="h-80 overflow-hidden rounded-lg border border-border bg-card">
          <JsonInspector
            data={receipt}
            label="Exact refresh receipt"
            defaultView="json"
            defaultExpandDepth={3}
            className="rounded-none"
          />
        </section>
      ) : null}

      <section className="min-h-[30rem] rounded-lg border border-border bg-card p-2">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold">
              <Database className="h-3.5 w-3.5" /> Stored backlink rows
            </h2>
            <p className="text-[10px] text-muted-foreground">
              Latest detail snapshot
              {detailSnapshot
                ? ` · ${formatCompactDate(detailSnapshot.created_at)}`
                : " · not collected yet"}
            </p>
          </div>
        </div>
        <MatrxDataTable<BacklinkObservationRow>
          data={backlinks.data?.rows ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={backlinks.isLoading}
          isFetching={backlinks.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: backlinks.data?.total ?? 0,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search source, target, or anchor…" }}
          emptyState={{
            icon: <Link2 className="h-8 w-8 text-muted-foreground" />,
            title: "No detailed backlinks stored",
            description:
              "Run Full bootstrap or Monthly detail to collect backlink rows.",
          }}
          detail={{
            title: (row) => row.source_domain ?? row.source_url,
            description: (row) => `${row.state} link to ${row.target_url}`,
          }}
        />
      </section>
    </main>
    </SurfaceRuntimeProvider>
  );
}
