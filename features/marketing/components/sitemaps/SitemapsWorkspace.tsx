"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CirclePause,
  CirclePlay,
  ExternalLink,
  FileCode2,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingSitemapsScope } from "@/features/surfaces/manifests/marketing-sitemaps.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  marketingKeys,
  useDeleteSitemap,
  useSetSitemapActive,
  useSitemapCoverage,
  useSitemaps,
} from "@/features/marketing/data/hooks";
import {
  formatCompactDate,
  formatDate,
  LoadingSurface,
  MetricCell,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { syncSitemaps } from "@/features/marketing/crawler/direct-client";
import { webCopy, webLocation } from "@/features/marketing/lib/copy-payloads";
import type { SiteSitemap } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

export function SitemapsWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sitemaps = useSitemaps(site.id);
  const coverage = useSitemapCoverage(site.id);
  const [syncing, setSyncing] = useState(false);
  const setActiveMutation = useSetSitemapActive(site.id);
  const deleteMutation = useDeleteSitemap(site.id);
  const [deleting, setDeleting] = useState<SiteSitemap | null>(null);

  const toggleActive = async (sitemap: SiteSitemap) => {
    try {
      await setActiveMutation.mutateAsync({
        sitemapId: sitemap.id,
        isActive: !sitemap.is_active,
      });
      toast.success(
        sitemap.is_active ? "Sitemap deactivated" : "Sitemap activated",
      );
    } catch (error) {
      toast.error("Could not update sitemap", {
        description: extractErrorMessage(error),
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Sitemap deleted");
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete sitemap", {
        description: extractErrorMessage(error),
      });
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      await syncSitemaps(site.id);
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      toast.success("Sitemaps synced");
    } catch (error) {
      toast.error("Sitemap sync failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSyncing(false);
    }
  };

  if (sitemaps.isLoading) return <LoadingSurface label="Loading sitemaps…" />;
  if (sitemaps.isError) {
    return (
      <QueryError
        error={sitemaps.error}
        onRetry={() => void sitemaps.refetch()}
      />
    );
  }

  const rows = sitemaps.data ?? [];
  const indexes = rows.filter((sitemap) => sitemap.kind === "sitemapindex");
  const urlsets = rows.filter((sitemap) => sitemap.kind !== "sitemapindex");
  const pageLocation = webLocation(`Sitemaps — ${site.root_url}`);

  const listCopy = webCopy({
    kind: "web-sitemaps-list",
    label: "All sitemaps",
    description:
      "Every sitemap document recorded for this site plus the coverage rollup over the canonical page registry.",
    surface: `Sitemaps — ${site.root_url}`,
    data: { sitemaps: rows, coverage: coverage.data ?? null },
    lines: [
      ["Site", site.root_url],
      ["Sitemaps", rows.length],
      ["Indexes", indexes.length],
      ["URL sets", urlsets.length],
      ["Pages in sitemaps", coverage.data?.pagesInSitemaps ?? null],
      ["Never crawled", coverage.data?.neverCrawled ?? null],
      [
        "Last synced",
        coverage.data?.lastSyncedAt
          ? formatDate(coverage.data.lastSyncedAt)
          : "Never",
      ],
      ...rows.map(
        (sitemap): [string, string] => [
          sitemap.kind === "sitemapindex" ? "Index" : "URL set",
          `${sitemap.url} (${sitemap.url_count?.toLocaleString() ?? "—"} URLs, HTTP ${sitemap.status_code ?? "—"}${sitemap.is_active ? "" : ", inactive"})`,
        ],
      ),
    ],
    attributes: { site_id: site.id, count: rows.length },
  });

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "coverage",
      title: "Coverage rollup",
      description: "Sitemap counts + page-registry coverage.",
      build: () => coverage.data ?? null,
    },
    {
      id: "sitemaps",
      title: "Sitemap documents",
      description: `${rows.length} recorded sitemap documents.`,
      cuttable: true,
      levelLabels: {
        full: `All ${rows.length} (raw)`,
        compact: "Top 25",
        brief: "Counts only",
      },
      build: (level) =>
        level === "full"
          ? rows
          : level === "compact"
            ? rows.slice(0, 25)
            : { indexes: indexes.length, url_sets: urlsets.length },
    },
  ];

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Sitemaps — ${site.root_url}`,
    kind: "marketing-sitemaps-page",
    location: pageLocation,
    description: `Every sitemap document and the coverage rollup for ${site.root_url}.`,
    attributes: { site_id: site.id, domain: site.root_url },
    summary: listCopy.human(),
    sections: groomerSections(),
  });

  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-sitemaps"
      getScope={() =>
        createMarketingSitemapsScope({
          ...getBaseValues(),
          sitemaps_summary: rows.slice(0, 30).map((sitemap) => ({
            url: sitemap.url,
            kind: sitemap.kind,
            http_status: sitemap.status_code,
            url_count: sitemap.url_count,
            child_count: sitemap.child_count,
            is_active: sitemap.is_active,
            fetch_error: sitemap.fetch_error,
            last_fetched_at: sitemap.last_fetched_at,
          })),
          sitemap_counts: {
            total: coverage.data?.sitemaps ?? rows.length,
            indexes: indexes.length,
            url_sets: urlsets.length,
          },
          sitemap_coverage: coverage.data
            ? {
                sitemaps: coverage.data.sitemaps,
                pages_in_sitemaps: coverage.data.pagesInSitemaps,
                never_crawled: coverage.data.neverCrawled,
                last_synced_at: coverage.data.lastSyncedAt,
              }
            : undefined,
          sitemap_pages_total: coverage.data?.pagesInSitemaps,
          sitemap_never_crawled: coverage.data?.neverCrawled,
          sitemaps_last_synced_at: coverage.data?.lastSyncedAt ?? undefined,
        })
      }
    >
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              Sitemaps
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {rows.length}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Every sitemap this site publishes, and how its URLs flow into the
              canonical page registry.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <CopyButtons size="icon" {...listCopy} json={() => pageFullData()} />
            <ExportMenu
              label={`sitemaps-${site.root_url}`}
              items={[
                jsonExportItem(pageFullData, "JSON (page data)"),
                {
                  id: "csv",
                  label: "CSV (sitemaps)",
                  build: () => ({
                    content: rowsToCsv(
                      rows as unknown as Array<Record<string, unknown>>,
                    ),
                    extension: "csv",
                    mime: "text/csv",
                  }),
                },
              ]}
            />
            <AgentCopyGroomerLauncher config={groomerConfig} />
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={syncing}
              onClick={() => void runSync()}
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncing ? "Syncing…" : "Sync sitemaps"}
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
          <MetricCell
            label="Sitemaps"
            value={(coverage.data?.sitemaps ?? rows.length).toLocaleString()}
            detail={`${indexes.length} index, ${urlsets.length} URL sets`}
            copy={webCopy({
              kind: "web-sitemaps-metric",
              label: "Sitemaps",
              description: "Total recorded sitemap documents for this site.",
              surface: `Sitemaps — Sitemaps count — ${site.root_url}`,
              data: {
                sitemaps: coverage.data?.sitemaps ?? rows.length,
                indexes: indexes.length,
                url_sets: urlsets.length,
              },
              lines: [
                ["Sitemaps", coverage.data?.sitemaps ?? rows.length],
                ["Indexes", indexes.length],
                ["URL sets", urlsets.length],
              ],
              attributes: { site_id: site.id },
            })}
          />
          <MetricCell
            label="Pages in sitemaps"
            value={coverage.data?.pagesInSitemaps.toLocaleString() ?? "—"}
            detail="Canonical registry entries"
            copy={webCopy({
              kind: "web-sitemaps-metric",
              label: "Pages in sitemaps",
              description: "Canonical registry pages listed in a sitemap.",
              surface: `Sitemaps — Pages in sitemaps — ${site.root_url}`,
              data: { pages_in_sitemaps: coverage.data?.pagesInSitemaps ?? null },
              lines: [["Pages in sitemaps", coverage.data?.pagesInSitemaps ?? null]],
              attributes: { site_id: site.id },
            })}
          />
          <MetricCell
            label="Never crawled"
            value={coverage.data?.neverCrawled.toLocaleString() ?? "—"}
            detail="Listed but not yet captured"
            tone={coverage.data?.neverCrawled ? "warning" : "good"}
            copy={webCopy({
              kind: "web-sitemaps-metric",
              label: "Never crawled",
              description:
                "Pages listed in a sitemap that have never been captured by a crawl.",
              surface: `Sitemaps — Never crawled — ${site.root_url}`,
              data: { never_crawled: coverage.data?.neverCrawled ?? null },
              lines: [["Never crawled", coverage.data?.neverCrawled ?? null]],
              attributes: { site_id: site.id },
            })}
          />
          <MetricCell
            label="Last synced"
            value={
              coverage.data?.lastSyncedAt
                ? formatCompactDate(coverage.data.lastSyncedAt)
                : "Never"
            }
            detail="From robots.txt + indexes"
            tone={coverage.data?.lastSyncedAt ? "default" : "warning"}
            copy={webCopy({
              kind: "web-sitemaps-metric",
              label: "Last synced",
              description: "When sitemaps were last synced for this site.",
              surface: `Sitemaps — Last synced — ${site.root_url}`,
              data: { last_synced_at: coverage.data?.lastSyncedAt ?? null },
              lines: [
                [
                  "Last synced",
                  coverage.data?.lastSyncedAt
                    ? formatDate(coverage.data.lastSyncedAt)
                    : "Never",
                ],
              ],
              attributes: { site_id: site.id },
            })}
          />
        </section>

        {rows.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
            <MapIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No sitemaps recorded yet
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Run a sync to discover this site's sitemaps and pull every listed
              URL into the canonical page registry.
            </p>
            <Button
              size="sm"
              className="mt-1 h-8"
              disabled={syncing}
              onClick={() => void runSync()}
            >
              Sync sitemaps
            </Button>
          </div>
        ) : (
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {rows.map((sitemap) => (
                <SitemapRow
                  key={sitemap.id}
                  sitemap={sitemap}
                  onOpen={() =>
                    sitemap.kind !== "sitemapindex"
                      ? router.push(`${sitePath}/sitemaps/${sitemap.id}`)
                      : undefined
                  }
                  onToggleActive={() => void toggleActive(sitemap)}
                  onDelete={() => setDeleting(sitemap)}
                  mutating={setActiveMutation.isPending}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete sitemap?"
        description={
          deleting
            ? `${deleting.url} and its page-membership evidence move to trash. Canonical pages stay in the registry. A future sync that re-discovers this sitemap re-creates it.`
            : ""
        }
        variant="destructive"
        confirmLabel="Delete sitemap"
        busy={deleteMutation.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </main>
    </SurfaceRuntimeProvider>
  );
}

function SitemapRow({
  sitemap,
  onOpen,
  onToggleActive,
  onDelete,
  mutating,
}: {
  sitemap: SiteSitemap;
  onOpen: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  mutating: boolean;
}) {
  const isIndex = sitemap.kind === "sitemapindex";
  const rowCopy = webCopy({
    kind: "web-sitemap",
    label: `Sitemap ${sitemap.url}`,
    description: "One discovered sitemap document for this site.",
    surface: `Sitemaps — ${sitemap.url}`,
    data: sitemap,
    lines: [
      ["URL", sitemap.url],
      ["Kind", sitemap.kind],
      ["URLs listed", sitemap.url_count],
      ["Child sitemaps", sitemap.child_count],
      ["HTTP", sitemap.status_code],
      ["Active", sitemap.is_active ? "yes" : "no"],
      ["Fetch error", sitemap.fetch_error],
      [
        "Last fetched",
        sitemap.last_fetched_at ? formatDate(sitemap.last_fetched_at) : "never",
      ],
    ],
    attributes: {
      sitemap_id: sitemap.id,
      site_id: sitemap.site_id,
      kind: sitemap.kind,
    },
  });
  const healthy =
    sitemap.status_code !== null &&
    sitemap.status_code >= 200 &&
    sitemap.status_code < 300 &&
    !sitemap.fetch_error;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 px-3 py-2",
        !isIndex && "cursor-pointer hover:bg-muted/30",
      )}
      onClick={isIndex ? undefined : onOpen}
    >
      <FileCode2
        className={cn(
          "h-4 w-4 shrink-0",
          isIndex ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1 basis-64">
        <p className="truncate font-mono text-xs text-foreground">
          {sitemap.url}
        </p>
        {sitemap.fetch_error ? (
          <p className="truncate text-[11px] text-destructive">
            {sitemap.fetch_error}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {sitemap.last_fetched_at
              ? `Fetched ${formatDate(sitemap.last_fetched_at)}`
              : "Not fetched yet"}
          </p>
        )}
      </div>
      <Badge variant={isIndex ? "default" : "outline"} className="text-[10px]">
        {isIndex ? `Index · ${sitemap.child_count ?? 0} children` : "URL set"}
      </Badge>
      {!sitemap.is_active ? (
        <Badge variant="secondary" className="text-[10px]">
          Inactive
        </Badge>
      ) : null}
      {!isIndex ? (
        <span className="w-20 text-right font-mono text-xs tabular-nums">
          {sitemap.url_count?.toLocaleString() ?? "—"} URLs
        </span>
      ) : null}
      <span
        className={cn(
          "w-12 text-right font-mono text-xs tabular-nums",
          healthy ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {sitemap.status_code ?? "—"}
      </span>
      <span onClick={(event) => event.stopPropagation()}>
        <CopyButtons size="icon" {...rowCopy} />
      </span>
      <a
        href={sitemap.url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Open sitemap XML"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        title={sitemap.is_active ? "Deactivate sitemap" : "Activate sitemap"}
        disabled={mutating}
        onClick={(event) => {
          event.stopPropagation();
          onToggleActive();
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {sitemap.is_active ? (
          <CirclePause className="h-3.5 w-3.5" />
        ) : (
          <CirclePlay className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        title="Delete sitemap"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
