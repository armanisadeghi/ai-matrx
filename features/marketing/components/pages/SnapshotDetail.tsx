"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useSnapshot } from "@/features/marketing/data/hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { Json } from "@/types/database.types";
import {
  CondensedFieldGrid,
  formatCompactDate,
  formatDate,
  JsonPreview,
  LoadingSurface,
  MetricCell,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { SnapshotArtifacts } from "@/features/marketing/components/pages/SnapshotArtifacts";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { RecordStamps } from "@/components/official/record-stamps/RecordStamps";
import { useRecordActors } from "@/components/official/record-stamps/useRecordActors";
import {
  CrawlSessionRef,
  useCrawlSessionRef,
} from "@/features/marketing/components/shared/MarketingRefs";

export function SnapshotDetail({
  pageId,
  snapshotId,
}: {
  pageId: string;
  snapshotId: string;
}) {
  const { site, sitePath } = useMarketingSite();
  const snapshot = useSnapshot(site.id, pageId, snapshotId);
  // Hooks run before the guards — the doors below need them either way.
  const resolveActor = useRecordActors(snapshot.data?.organization_id, [
    snapshot.data?.created_by,
    snapshot.data?.updated_by,
  ]);
  // access-errors: ok — door ref to the crawl session; the snapshot primary is gated below and a failed ref only weakens the door label
  const crawl = useCrawlSessionRef(site.id, snapshot.data?.session_id);
  if (snapshot.isLoading) return <LoadingSurface label="Loading snapshot…" />;
  if (snapshot.isError || !snapshot.data) {
    return (
      <AccessGate
        token="web_snapshot"
        id={snapshotId}
        error={snapshot.error}
        onRetry={() => void snapshot.refetch()}
        fallbackHref={`${sitePath}/pages/${pageId}`}
        fallbackLabel="Back to the page"
      />
    );
  }
  const row = snapshot.data;
  const snapshotCopy = webCopy({
    kind: "web-snapshot",
    label: `Snapshot ${row.id.slice(0, 8)}`,
    description:
      "One immutable page content snapshot: full row with head tags, headings, extracted content, structured data, links, performance, and images.",
    surface: `Snapshot detail — ${row.final_url ?? row.id}`,
    data: row,
    lines: [
      ["Snapshot", row.id],
      ["Final URL", row.final_url],
      ["Captured", formatDate(row.captured_at)],
      ["HTTP", row.http_status],
      ["Words", row.word_count],
      ["Content hash", row.content_hash],
      ["Crawl session", row.session_id],
      ["Page", pageId],
      ["Body file", row.body_file_id],
      ["Markdown file", row.markdown_file_id],
      ["Row version", row.version],
    ],
    attributes: { snapshot_id: row.id, page_id: pageId, site_id: site.id },
  });
  const sectionCopy = (
    kind: string,
    label: string,
    description: string,
    value: Json,
  ) =>
    webCopy({
      kind,
      label,
      description,
      surface: `Snapshot ${label} — ${row.final_url ?? row.id}`,
      data: value,
      lines: [
        ["Snapshot", row.id],
        ["Final URL", row.final_url],
        ["Captured", formatDate(row.captured_at)],
      ],
      attributes: { snapshot_id: row.id, page_id: pageId, site_id: site.id },
    });
  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        {/* Stacks on mobile: at 375px the row squeezed the identity column to
            ~1ch and printed "IMMUTABLE SNAPSHOT" one letter per line, with the
            id and URL pushed out of view entirely. */}
        <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <ShareButton
              resourceType="web_snapshot"
              resourceId={row.id}
              resourceName={row.final_url || `Snapshot ${row.id.slice(0, 8)}`}
              size="sm"
              showStatus={false}
            />
            <CopyButtons size="icon" {...snapshotCopy} />
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
        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-5">
          <MetricCell
            label="Captured"
            value={formatCompactDate(row.captured_at)}
            detail={formatDate(row.captured_at)}
          />
          <MetricCell label="HTTP" value={row.http_status ?? "—"} />
          <MetricCell
            label="Words"
            value={row.word_count?.toLocaleString() ?? "—"}
          />
          <MetricCell
            label="Body stored"
            value={row.body_file_id ? "Yes" : "No"}
          />
          <MetricCell
            label="Markdown stored"
            value={row.markdown_file_id ? "Yes" : "No"}
          />
        </section>

        {/* Identity + the two records this snapshot BELONGS to. The crawl was
            an inert eight-character id; the page was not named at all. */}
        <section className="rounded-lg border border-border bg-card p-3">
          <CondensedFieldGrid
            fields={[
              {
                label: "Page",
                value: (
                  <EntityRef
                    token="web_page"
                    id={pageId}
                    name={row.final_url ?? undefined}
                    href={`${sitePath}/pages/${pageId}`}
                    wrap
                  />
                ),
                span: 2,
              },
              {
                label: "Crawl session",
                value: (
                  <CrawlSessionRef
                    sitePath={sitePath}
                    sessionId={row.session_id}
                    label={
                      crawl.data
                        ? `Crawl ${crawl.data.trigger} · ${crawl.data.status}`
                        : null
                    }
                  />
                ),
                span: 2,
              },
              {
                label: "Site",
                value: (
                  <EntityRef
                    token="web_site"
                    id={row.site_id}
                    name={site.name}
                    wrap
                  />
                ),
              },
              {
                label: "Snapshot id",
                value: (
                  <span className="break-all font-mono text-[11px]">
                    {row.id}
                  </span>
                ),
              },
              {
                label: "Content hash",
                value: (
                  <span className="break-all font-mono text-[11px]">
                    {row.content_hash || "—"}
                  </span>
                ),
                span: 2,
              },
            ]}
          />
          <RecordStamps
            organizationId={row.organization_id}
            createdAt={row.created_at}
            createdBy={row.created_by}
            updatedAt={row.updated_at}
            updatedBy={row.updated_by}
            deletedAt={row.deleted_at}
            version={row.version}
            formatTimestamp={formatDate}
            resolveActor={resolveActor}
            className="mt-3 border-t border-border pt-3"
          />
        </section>
        <SnapshotArtifacts siteId={site.id} snapshot={row} showMarkdown />
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard
            title="Head tags"
            copy={sectionCopy(
              "web-snapshot-head-tags",
              "Head tags",
              "The <head> tag inventory observed in this snapshot.",
              row.head_tags,
            )}
          >
            <JsonPreview value={row.head_tags} />
          </SectionCard>
          <SectionCard
            title="Headings"
            copy={sectionCopy(
              "web-snapshot-headings",
              "Headings",
              "The heading outline (h1–h6) observed in this snapshot.",
              row.headings,
            )}
          >
            <JsonPreview value={row.headings} />
          </SectionCard>
          <SectionCard
            title="Extracted content"
            copy={sectionCopy(
              "web-snapshot-extracted",
              "Extracted content",
              "Extracted content statistics recorded for this snapshot.",
              row.extracted,
            )}
          >
            <JsonPreview value={row.extracted} />
          </SectionCard>
          <SectionCard
            title="Structured data"
            copy={sectionCopy(
              "web-snapshot-structured-data",
              "Structured data",
              "Structured data (Schema.org / JSON-LD) observed in this snapshot.",
              row.structured_data,
            )}
          >
            <JsonPreview value={row.structured_data} />
          </SectionCard>
          <SectionCard
            title="Link summary"
            copy={sectionCopy(
              "web-snapshot-links-summary",
              "Link summary",
              "The link summary recorded for this snapshot.",
              row.links_summary,
            )}
          >
            <JsonPreview value={row.links_summary} />
          </SectionCard>
          <SectionCard
            title="Performance"
            copy={sectionCopy(
              "web-snapshot-performance",
              "Performance",
              "Performance measurements recorded for this snapshot.",
              row.perf,
            )}
          >
            <JsonPreview value={row.perf} />
          </SectionCard>
          <SectionCard
            title="Images"
            className="lg:col-span-2"
            copy={sectionCopy(
              "web-snapshot-images",
              "Images",
              "The image inventory observed in this snapshot.",
              row.images,
            )}
          >
            <JsonPreview value={row.images} />
          </SectionCard>
          {/* Three stored columns this "full immutable record" never rendered
              (D150 P0): the SEO and audit measurements the crawl computed, and
              the row's own metadata. */}
          <SectionCard
            title="SEO metrics"
            copy={sectionCopy(
              "web-snapshot-seo-metrics",
              "SEO metrics",
              "The SEO measurements computed for this snapshot.",
              row.seo_metrics,
            )}
          >
            <JsonPreview value={row.seo_metrics} />
          </SectionCard>
          <SectionCard
            title="Audit metrics"
            copy={sectionCopy(
              "web-snapshot-audit-metrics",
              "Audit metrics",
              "The audit measurements computed for this snapshot.",
              row.audit_metrics,
            )}
          >
            <JsonPreview value={row.audit_metrics} />
          </SectionCard>
          <SectionCard
            title="Snapshot metadata"
            className="lg:col-span-2"
            copy={sectionCopy(
              "web-snapshot-metadata",
              "Snapshot metadata",
              "The record's own metadata column.",
              row.metadata,
            )}
          >
            <JsonPreview value={row.metadata} />
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
