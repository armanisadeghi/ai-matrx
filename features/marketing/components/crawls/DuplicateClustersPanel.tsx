"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Copy, ExternalLink, FileSearch } from "lucide-react";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useCrawlFingerprints } from "@/features/marketing/data/inspection-hooks";
import {
  buildDuplicateClusters,
  DEFAULT_DUPLICATE_SIMILARITY,
  DUPLICATE_SIMILARITY_OPTIONS,
  type DuplicateCluster,
  type FingerprintPageRow,
} from "@/features/marketing/lib/duplicate-clusters";
import { parseSnapshotFingerprint } from "@/features/marketing/lib/snapshot-content";

/**
 * Duplicate-content clusters for one crawl session — exact duplicates grouped
 * by content hash, near-duplicates clustered on capture-time simhash
 * fingerprints above a user-visible similarity threshold (Screaming Frog's
 * 90% default). Crawls that predate fingerprints get an explicit re-crawl
 * empty-state, never a silently empty report.
 */
export function DuplicateClustersPanel({ crawlId }: { crawlId: string }) {
  const { site, sitePath } = useMarketingSite();
  const [similarity, setSimilarity] = useState<number>(
    DEFAULT_DUPLICATE_SIMILARITY,
  );
  const query = useCrawlFingerprints(site.id, crawlId);

  const rows = useMemo<FingerprintPageRow[]>(
    () =>
      (query.data?.rows ?? []).map((row) => ({
        snapshotId: row.id,
        pageId: row.page_id,
        url: row.page?.url ?? row.final_url ?? row.page_id,
        wordCount: row.word_count,
        fingerprint: parseSnapshotFingerprint(row.fingerprint ?? null),
      })),
    [query.data],
  );
  const report = useMemo(
    () => buildDuplicateClusters(rows, similarity),
    [rows, similarity],
  );

  if (query.isLoading) {
    return <LoadingSurface label="Loading content fingerprints…" />;
  }
  if (query.isError) {
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyPanel
        title="No captures in this crawl"
        description="Duplicate detection runs over the content snapshots a crawl captures."
      />
    );
  }
  if (report.fingerprinted === 0) {
    return (
      <EmptyPanel
        title="This crawl predates content fingerprints"
        description="Fingerprints are computed at capture time. Run a new crawl of this site to populate exact and near-duplicate detection."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Near-duplicate threshold
          <select
            value={similarity}
            onChange={(event) => setSimilarity(Number(event.target.value))}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            {DUPLICATE_SIMILARITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}%
              </option>
            ))}
          </select>
        </label>
        <span className="text-[11px] text-muted-foreground">
          {report.exact.length.toLocaleString()} exact ·{" "}
          {report.near.length.toLocaleString()} near clusters ·{" "}
          {report.duplicatePages.toLocaleString()} pages affected ·{" "}
          {report.fingerprinted.toLocaleString()} fingerprinted captures
        </span>
        {report.withoutFingerprint > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {report.withoutFingerprint.toLocaleString()} captures without a
            fingerprint (older crawl or empty text) — re-crawl to include them
          </span>
        ) : null}
        {query.data?.truncated ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Clustering the first {rows.length.toLocaleString()} of{" "}
            {(query.data?.total ?? 0).toLocaleString()} captures
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {report.exact.length === 0 && report.near.length === 0 ? (
          <EmptyPanel
            title="No duplicate content found"
            description={`No exact duplicates and no pages at or above ${similarity}% similarity in this crawl.`}
          />
        ) : (
          <>
            <ClusterSection
              title="Exact duplicates"
              description="Pages whose normalized text content is identical."
              clusters={report.exact}
              sitePath={sitePath}
            />
            <ClusterSection
              title={`Near duplicates (≥ ${similarity}% similar)`}
              description="Clusters of pages whose content fingerprints agree above the threshold. Exact-duplicate groups count as one member."
              clusters={report.near}
              sitePath={sitePath}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ClusterSection({
  title,
  description,
  clusters,
  sitePath,
}: {
  title: string;
  description: string;
  clusters: DuplicateCluster[];
  sitePath: string;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {clusters.length.toLocaleString()} clusters
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {description}
        </span>
      </div>
      {clusters.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
          None found.
        </p>
      ) : (
        <div className="space-y-2">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.key}
              cluster={cluster}
              sitePath={sitePath}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ClusterCard({
  cluster,
  sitePath,
}: {
  cluster: DuplicateCluster;
  sitePath: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-foreground">
          {cluster.pages.length.toLocaleString()} pages
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            cluster.kind === "exact"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {cluster.kind === "exact"
            ? "100% identical"
            : `≥ ${cluster.similarity.toFixed(1)}% similar`}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {cluster.pages.map((page) => (
          <li
            key={page.snapshotId}
            className="flex items-center gap-2 px-3 py-1"
          >
            <Link
              href={`${sitePath}/pages/${page.pageId}`}
              className="min-w-0 flex-1 truncate font-mono text-xs text-primary"
              title={page.url}
            >
              {page.url}
            </Link>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {page.wordCount === null
                ? "— words"
                : `${page.wordCount.toLocaleString()} words`}
            </span>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-muted-foreground hover:text-primary"
              aria-label={`Open ${page.url}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
      <FileSearch className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
