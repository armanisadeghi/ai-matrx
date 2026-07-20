"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useSnapshot } from "@/features/marketing/data/hooks";
import {
  formatDate,
  JsonPreview,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { SnapshotArtifacts } from "@/features/marketing/components/pages/SnapshotArtifacts";

export function SnapshotDetail({
  pageId,
  snapshotId,
}: {
  pageId: string;
  snapshotId: string;
}) {
  const { site, sitePath } = useMarketingSite();
  const snapshot = useSnapshot(site.id, pageId, snapshotId);
  if (snapshot.isLoading) return <LoadingSurface label="Loading snapshot…" />;
  if (snapshot.isError || !snapshot.data) {
    return (
      <QueryError
        error={snapshot.error ?? new Error("Snapshot not found")}
        onRetry={() => void snapshot.refetch()}
      />
    );
  }
  const row = snapshot.data;
  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Immutable snapshot
            </p>
            <h1 className="mt-1 truncate font-mono text-xs font-semibold">
              {row.id}
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.final_url || "No final URL recorded"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link
                href={`${sitePath}/pages/${pageId}/snapshots`}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Timeline
              </Link>
            </Button>
            {row.final_url ? (
              <Button asChild variant="outline" size="icon" className="h-8 w-8">
                <a
                  href={row.final_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open observed URL"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        </section>
        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell label="Captured" value={formatDate(row.captured_at)} />
          <MetricCell label="HTTP" value={row.http_status ?? "—"} />
          <MetricCell
            label="Words"
            value={row.word_count?.toLocaleString() ?? "—"}
          />
          <MetricCell
            label="Content hash"
            value={row.content_hash ? row.content_hash.slice(0, 12) : "—"}
          />
          <MetricCell label="Crawl" value={row.session_id.slice(0, 8)} />
          <MetricCell
            label="Body"
            value={row.body_file_id ? "Stored" : "None"}
          />
        </section>
        <SnapshotArtifacts siteId={site.id} snapshot={row} showMarkdown />
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Head tags">
            <JsonPreview value={row.head_tags} />
          </SectionCard>
          <SectionCard title="Headings">
            <JsonPreview value={row.headings} />
          </SectionCard>
          <SectionCard title="Extracted content">
            <JsonPreview value={row.extracted} />
          </SectionCard>
          <SectionCard title="Structured data">
            <JsonPreview value={row.structured_data} />
          </SectionCard>
          <SectionCard title="Link summary">
            <JsonPreview value={row.links_summary} />
          </SectionCard>
          <SectionCard title="Performance">
            <JsonPreview value={row.perf} />
          </SectionCard>
          <SectionCard title="Images" className="lg:col-span-2">
            <JsonPreview value={row.images} />
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
