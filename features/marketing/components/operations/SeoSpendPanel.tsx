"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * SEO provider spend rollup panel (M-9 / WS-7 UI tranche) — the third
 * `/marketing/cost` mode, alongside "By site" / "By client". Reads
 * `GET /seo/spend/summary`: this-month + last-month provider breakdown
 * (spent vs the org/provider monthly ceiling, % used), a 30-day daily
 * spend chart, and any recent `seo_budget_exceeded` rejections so a
 * budget-blocked run is visible, not silent.
 */

import { useState } from "react";
import { AlertTriangle, Gauge, Copy } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { SeoSpendChart } from "@/features/marketing/components/operations/SeoSpendChart";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import {
  useSeoSpendSummary,
  type SeoBudgetRejectionRow,
  type SeoProviderSpendRow,
} from "@/features/marketing/data/spend";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import {
  groupSpendByCategory,
  spendCategory,
  type SpendCategoryRow,
} from "@/features/marketing/data/spend-categories";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { NO_RAW_ROW_WINDOW } from "@/features/marketing/social/row-open";

/** Vendor names as their owners write them; anything else is humanized. */
const PROVIDER_LABELS: Record<string, string> = {
  dataforseo: "DataForSEO",
  serpapi: "SerpApi",
  gsc: "Search Console",
  aidream: "AI Dream",
  scrapecreators: "ScrapeCreators",
};
const providerLabel = (provider: string): string =>
  PROVIDER_LABELS[provider.trim().toLowerCase()] ?? (humanizeIdentifier(provider) || provider);

function ProviderRow({ row }: { row: SeoProviderSpendRow }) {
  const { unit, rate: costRate } = useCostDisplay();
  const pct = Math.max(0, Math.min(100, row.pct_used));
  const over = row.pct_used >= 100;
  const warn = row.pct_used >= 80 && !over;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card p-2.5">
      <span className="text-xs font-medium text-foreground">
        {providerLabel(row.provider)}
      </span>
      <span className="text-right font-mono text-xs font-semibold tabular-nums">
        {formatRuntimeCost(row.effective_cost, costRate, unit)}{" "}
        <span className="font-normal text-muted-foreground">
          / {formatRuntimeCost(row.ceiling_usd, costRate, unit)}
        </span>
      </span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={
            over
              ? "h-full bg-destructive"
              : warn
                ? "h-full bg-amber-500"
                : "h-full bg-primary"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="col-span-2 text-xs text-muted-foreground">
        {row.run_count} paid run{row.run_count === 1 ? "" : "s"} ·{" "}
        {row.pct_used.toFixed(1)}% of monthly ceiling
      </span>
    </div>
  );
}

/** The social-data provider's own admin row (its spend comes as the social line, not as a provider row). */
function SocialProviderRow({ usd, calls }: { usd: number | null; calls: number | null }) {
  const { unit, rate: costRate } = useCostDisplay();
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card p-2.5">
      <span className="text-xs font-medium text-foreground">Scrape Creators</span>
      <span className="text-right font-mono text-xs font-semibold tabular-nums">
        {usd == null ? "—" : formatRuntimeCost(usd, costRate, unit)}
      </span>
      <span className="col-span-2 text-xs text-muted-foreground">
        {calls ?? 0} paid call{calls === 1 ? "" : "s"} · social data
      </span>
    </div>
  );
}

/** The person-facing line: an activity (SEO data, Web search, Social data…), never a vendor. */
function CategoryRow({ row }: { row: SpendCategoryRow }) {
  const { unit, rate: costRate } = useCostDisplay();
  const pct = Math.max(0, Math.min(100, row.pctUsed));
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card p-2.5">
      <span className="text-xs font-medium text-foreground">{row.category}</span>
      <span className="text-right font-mono text-xs font-semibold tabular-nums">
        {formatRuntimeCost(row.usd, costRate, unit)}
      </span>
      {row.pctUsed > 0 ? (
        <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={row.pctUsed >= 100 ? "h-full bg-destructive" : row.pctUsed >= 80 ? "h-full bg-amber-500" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <span className="col-span-2 text-xs text-muted-foreground">
        {row.runs} paid call{row.runs === 1 ? "" : "s"}
        {row.unpricedRuns > 0 ? ` · ${row.unpricedRuns} not yet priced` : ""}
      </span>
    </div>
  );
}

export function SeoSpendPanel() {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const { unit, rate: costRate, canToggle: isPlatformAdmin } = useCostDisplay();
  // THE PAGE'S ORGANIZATION FILTER (`?org_filter=`, default All organizations — never the active
  // organization, which only decides where new things are saved). All organizations sums the
  // person's organizations; one organization shows its own ceilings against its own spend, and
  // the header says which.
  const [orgFilter, setOrgFilter] = useOrgFilterParam();
  const { organizations } = useUserOrganizations();
  const spend = useSeoSpendSummary(orgFilter);
  const orgName = orgFilter
    ? (organizations.find((org) => org.id === orgFilter)?.name ?? "")
    : "All organizations";
  const orgFilterControl = (
    <div className="flex justify-end pb-2">
      <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} />
    </div>
  );
  /** Right-clicked rejection row — STATE (not a ref) so the menu reads the
   *  row that was actually clicked. */
  const [clickedRejection, setClickedRejection] =
    useState<SeoBudgetRejectionRow | null>(null);

  if (spend.isError) {
    return (
      <div>
        {orgFilterControl}
        <QueryError error={spend.error} onRetry={() => void spend.refetch()} />
      </div>
    );
  }
  if (spend.isLoading || !spend.data) {
    return (
      <div>
        {orgFilterControl}
        <div className="p-4">
          <RegionSkeleton shape="rows" count={4} aria-label="Loading spend" />
        </div>
      </div>
    );
  }

  const data = spend.data;
  const paidThisMonth = data.this_month.filter(
    (row) => row.effective_cost > 0 || row.run_count > 0,
  );
  const hasSocialRow =
    ((data.social_this_month_usd ?? 0) > 0 || (data.social_this_month_calls ?? 0) > 0) &&
    !paidThisMonth.some((r) => r.provider.trim().toLowerCase() === "scrapecreators");
  const categories = groupSpendByCategory(data.this_month, {
    usd: data.social_this_month_usd,
    calls: data.social_this_month_calls,
  });
  const rejectionColumns: MatrxColumnDef<SeoBudgetRejectionRow>[] = [
    {
      id: "provider",
      accessorKey: "provider",
      header: isPlatformAdmin ? "Provider" : "Activity",
      filter: "select",
      cell: (row) => (
        <span className="capitalize">
          {isPlatformAdmin ? providerLabel(row.provider) : spendCategory(row.provider)}
        </span>
      ),
    },
    {
      id: "ceiling",
      accessorKey: "ceiling",
      header: "Ceiling",
      filter: "select",
      cell: (row) => (
        <Badge variant="destructive" className="text-[9px]">
          {row.ceiling ?? "budget exceeded"}
        </Badge>
      ),
    },
    {
      id: "spent_usd",
      accessorKey: "spent_usd",
      header: "Spent",
      filter: "number",
      align: "right",
      cell: (row) =>
        row.spent_usd === null ? "—" : formatRuntimeCost(row.spent_usd, costRate, unit),
    },
    {
      id: "limit_usd",
      accessorKey: "limit_usd",
      header: "Limit",
      filter: "number",
      align: "right",
      cell: (row) =>
        row.limit_usd === null ? "—" : formatRuntimeCost(row.limit_usd, costRate, unit),
    },
    {
      id: "occurred_at",
      accessorKey: "occurred_at",
      header: "When",
      filter: "text",
      cell: (row) =>
        new Date(row.occurred_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
    },
    {
      id: "run_id",
      accessorKey: "run_id",
      header: "Run",
      filter: "text",
      cellKind: "uuid",
      fk: { forbidden: true },
    },
  ];

  const resolveRejectionContext = (target: HTMLElement | null) => {
    const runId = target
      ?.closest("[data-row-id]")
      ?.getAttribute("data-row-id");
    const row =
      (runId &&
        data.recent_budget_rejections.find((r) => r.run_id === runId)) ||
      null;
    setClickedRejection(row);
    if (!row) return null;
    return {
      content: [
        `${isPlatformAdmin ? row.provider : spendCategory(row.provider)} — ${row.ceiling ?? "budget exceeded"}`,
        `spent=${row.spent_usd ?? "—"} limit=${row.limit_usd ?? "—"}`,
        `occurred: ${row.occurred_at}`,
        `run: ${row.run_id}`,
      ].join("\n"),
    };
  };

  const rejectionMenuSection: ContextMenuExtraSection = {
    id: "seo-budget-rejection-row",
    label: clickedRejection
      ? isPlatformAdmin
        ? clickedRejection.provider
        : spendCategory(clickedRejection.provider)
      : "This rejection",
    anchor: "after-compare",
    items: [
      {
        kind: "item",
        id: "seo-budget-rejection-copy-run-id",
        label: "Copy run ID",
        icon: Copy,
        disabled: !clickedRejection,
        onSelect: () => {
          if (!clickedRejection) return;
          void copyText(clickedRejection.run_id, "Run ID copied");
        },
      },
    ],
  };

  return (
    <div className="h-full overflow-y-auto p-1">
    {orgFilterControl}
    <div className="grid grid-rows-[auto_auto_1fr] gap-3">
      <section className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            This month by activity{orgName ? ` · ${orgName}` : ""}
            {data.organizationCount > 1 ? ` (${data.organizationCount} organizations)` : ""}
          </h2>
          <Button
            variant="quiet"
            onClick={() => void spend.refetch()}
            disabled={spend.isFetching}
          >
            Refresh
          </Button>
        </div>
        {categories.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            <Gauge className="h-4 w-4" /> No paid data activity recorded this month.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((row) => (
              <CategoryRow key={row.category} row={row} />
            ))}
          </div>
        )}
        {isPlatformAdmin && (paidThisMonth.length > 0 || hasSocialRow) ? (
          <div className="mt-3 border-t border-border pt-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Platform admin · by provider
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {paidThisMonth.map((row) => (
                <ProviderRow key={row.provider} row={row} />
              ))}
              {hasSocialRow ? <SocialProviderRow usd={data.social_this_month_usd} calls={data.social_this_month_calls} /> : null}
            </div>
          </div>
        ) : null}
        {data.unreadOrganizationIds.length > 0 ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {data.unreadOrganizationIds.length} of your organizations could not
            be read, so their spend is not included below. Pick one
            organization above to see its own error.
          </p>
        ) : null}
        {isPlatformAdmin ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Monthly ceiling per provider:{" "}
          {formatRuntimeCost(data.org_provider_monthly_ceiling_usd, costRate, unit)} for each
          organization, {formatRuntimeCost(data.global_provider_monthly_ceiling_usd, costRate, unit)} across
          the platform.
        </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Daily spend — last 30 days
        </h2>
        <SeoSpendChart points={data.daily_series} />
      </section>

      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Recent budget
          rejections
        </h2>
        <NonEditableContextMenu
          sourceFeature="marketing"
          contentSource={{ type: "raw" }}
          resolveContextOnOpen={resolveRejectionContext}
          extraSections={[rejectionMenuSection]}
        >
        <MatrxDataTable
          {...NO_RAW_ROW_WINDOW}
          urlState={{ id: "seo-budget-rejections" }}
          data={data.recent_budget_rejections}
          columns={rejectionColumns}
          getRowId={(row) => row.run_id}
          pageSize={10}
          pageSizeOptions={[10, 25, 50, 100]}
          emptyState={{
            title: "No recent budget rejections",
            description:
              "No runs were rejected for exceeding a spend ceiling in the last 30 days.",
          }}
        />
        </NonEditableContextMenu>
      </section>
    </div>
    </div>
  );
}
