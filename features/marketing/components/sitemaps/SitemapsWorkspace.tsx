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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import type { SiteSitemap } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

export function SitemapsWorkspace() {
  const { site, sitePath } = useMarketingSite();
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

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              Sitemaps
            </h1>
            <p className="text-xs text-muted-foreground">
              Every sitemap this site publishes, and how its URLs flow into the
              canonical page registry.
            </p>
          </div>
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
        </header>

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
          <MetricCell
            label="Sitemaps"
            value={(coverage.data?.sitemaps ?? rows.length).toLocaleString()}
            detail={`${indexes.length} index, ${urlsets.length} URL sets`}
          />
          <MetricCell
            label="Pages in sitemaps"
            value={coverage.data?.pagesInSitemaps.toLocaleString() ?? "—"}
            detail="Canonical registry entries"
          />
          <MetricCell
            label="Never crawled"
            value={coverage.data?.neverCrawled.toLocaleString() ?? "—"}
            detail="Listed but not yet captured"
            tone={coverage.data?.neverCrawled ? "warning" : "good"}
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
