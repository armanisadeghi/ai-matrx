"use client";

import { X } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  formatDate,
  LoadingSurface,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useSnapshot } from "@/features/marketing/data/hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
} from "@/features/marketing/lib/snapshot-content";
import { parseStoredSeoMetrics } from "@/features/marketing/seo/serp/metrics";
import type { PageSnapshot } from "@/features/marketing/types";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

interface CompareField {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

function fmt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? value.toLocaleString() : value;
}

function okFlag(value: boolean | null): string {
  if (value === null) return "not computed";
  return value ? "OK" : "Issues";
}

/**
 * Field-level diff between two snapshots, built exclusively from the
 * canonical narrowers (head-tags.ts / snapshot-content.ts / serp/metrics.ts)
 * — never raw snapshot JSON.
 */
function buildCompareFields(
  before: PageSnapshot,
  after: PageSnapshot,
): CompareField[] {
  const headA = parseSnapshotHeadTags(before.head_tags);
  const headB = parseSnapshotHeadTags(after.head_tags);
  const headingsA = parseSnapshotHeadings(before.headings);
  const headingsB = parseSnapshotHeadings(after.headings);
  const linksA = parseSnapshotLinksSummary(before.links_summary);
  const linksB = parseSnapshotLinksSummary(after.links_summary);
  const imagesA = parseSnapshotImages(before.images);
  const imagesB = parseSnapshotImages(after.images);
  const seoA = parseStoredSeoMetrics(before.seo_metrics);
  const seoB = parseStoredSeoMetrics(after.seo_metrics);
  const h1A = headingsA.all.find((entry) => entry.level === 1)?.text ?? null;
  const h1B = headingsB.all.find((entry) => entry.level === 1)?.text ?? null;

  const pairs: Array<[string, string, string]> = [
    ["Title", fmt(headA.title), fmt(headB.title)],
    [
      "Meta description",
      fmt(headA.metaDescription),
      fmt(headB.metaDescription),
    ],
    ["Canonical URL", fmt(headA.canonicalUrl), fmt(headB.canonicalUrl)],
    ["Meta robots", fmt(headA.metaRobots), fmt(headB.metaRobots)],
    ["First H1", fmt(h1A), fmt(h1B)],
    ["H1 count", fmt(headingsA.h1Count), fmt(headingsB.h1Count)],
    ["HTTP status", fmt(before.http_status), fmt(after.http_status)],
    ["Word count", fmt(before.word_count), fmt(after.word_count)],
    [
      "SEO title check",
      okFlag(seoA ? seoA.title.ok : null),
      okFlag(seoB ? seoB.title.ok : null),
    ],
    [
      "SEO description check",
      okFlag(seoA ? seoA.description.ok : null),
      okFlag(seoB ? seoB.description.ok : null),
    ],
    [
      "SEO overall",
      okFlag(seoA ? seoA.overall_ok : null),
      okFlag(seoB ? seoB.overall_ok : null),
    ],
    ["Headings outline", fmt(headingsA.all.length), fmt(headingsB.all.length)],
    ["Links total", fmt(linksA.total), fmt(linksB.total)],
    ["Links internal", fmt(linksA.internal), fmt(linksB.internal)],
    ["Links external", fmt(linksA.external), fmt(linksB.external)],
    ["Images", fmt(imagesA.count), fmt(imagesB.count)],
    ["Images missing alt", fmt(imagesA.missingAlt), fmt(imagesB.missingAlt)],
  ];
  return pairs.map(([label, beforeValue, afterValue]) => ({
    label,
    before: beforeValue,
    after: afterValue,
    changed: beforeValue !== afterValue,
  }));
}

/**
 * Side-by-side field diff between two snapshots of one canonical page.
 * The older capture always renders as "before" regardless of pick order.
 */
export function SnapshotCompare({
  pageId,
  firstId,
  secondId,
  onClose,
}: {
  pageId: string;
  firstId: string;
  secondId: string;
  onClose: () => void;
}) {
  const { site } = useMarketingSite();
  const first = useSnapshot(site.id, pageId, firstId);
  const second = useSnapshot(site.id, pageId, secondId);

  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={onClose}
      aria-label="Close comparison"
      title="Close comparison"
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );

  if (first.isLoading || second.isLoading) {
    return (
      <SectionCard title="Snapshot comparison" headerExtra={closeButton}>
        <LoadingSurface label="Loading snapshots…" />
      </SectionCard>
    );
  }
  if (first.isError || second.isError || !first.data || !second.data) {
    // Which of the two came back empty decides which record the gate resolves
    // — naming the wrong snapshot would be its own small lie.
    const firstFailed = first.isError || !first.data;
    const failed = firstFailed ? first : second;
    return (
      <SectionCard title="Snapshot comparison" headerExtra={closeButton}>
        <AccessGate
          token="web_snapshot"
          id={firstFailed ? firstId : secondId}
          error={failed.error}
          onRetry={() => {
            void first.refetch();
            void second.refetch();
          }}
        />
      </SectionCard>
    );
  }

  const chronological = [first.data, second.data].sort((a, b) =>
    a.captured_at.localeCompare(b.captured_at),
  );
  const before = chronological[0];
  const after = chronological[1];
  const fields = buildCompareFields(before, after);
  const changedCount = fields.filter((field) => field.changed).length;
  const columns: MatrxColumnDef<CompareField>[] = [
    {
      id: "label",
      accessorKey: "label",
      header: "Field",
      filter: "text",
      cellKind: "text",
      cell: (field) => (
        <span
          className={
            field.changed
              ? "font-medium text-amber-600 dark:text-amber-400"
              : "font-medium text-muted-foreground"
          }
        >
          {field.label}
        </span>
      ),
    },
    {
      id: "before",
      accessorKey: "before",
      header: `Before — ${formatDate(before.captured_at)}`,
      filter: "text",
      cellKind: "text",
      cell: (field) => (
        <span
          className={
            field.changed ? "text-foreground" : "text-muted-foreground"
          }
        >
          {field.before}
        </span>
      ),
    },
    {
      id: "after",
      accessorKey: "after",
      header: `After — ${formatDate(after.captured_at)}`,
      filter: "text",
      cellKind: "text",
      cell: (field) => (
        <span
          className={
            field.changed
              ? "font-medium text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          }
        >
          {field.after}
        </span>
      ),
    },
    {
      id: "changed",
      accessorKey: "changed",
      header: "Verdict",
      filter: "boolean",
      cell: (field) => (
        <Badge variant={field.changed ? "warning" : "secondary"}>
          {field.changed ? "Changed" : "Identical"}
        </Badge>
      ),
    },
  ];

  const copy = webCopy({
    kind: "web-page-snapshot-diff",
    label: "Snapshot comparison",
    description:
      "A field-by-field diff between two immutable content snapshots of one canonical page.",
    surface: `Snapshot comparison — ${after.final_url ?? after.id}`,
    data: {
      page_id: pageId,
      site_id: site.id,
      before_snapshot_id: before.id,
      after_snapshot_id: after.id,
      before_captured_at: before.captured_at,
      after_captured_at: after.captured_at,
      changed_fields: changedCount,
      fields: fields.map((field) => ({
        field: field.label,
        before: field.before,
        after: field.after,
        changed: field.changed,
      })),
    },
    lines: [
      ["Before snapshot", `${before.id} (${formatDate(before.captured_at)})`],
      ["After snapshot", `${after.id} (${formatDate(after.captured_at)})`],
      ["Changed fields", changedCount],
      ...fields
        .filter((field) => field.changed)
        .map((field): [string, string] => [
          field.label,
          `${field.before} → ${field.after}`,
        ]),
    ],
    attributes: {
      page_id: pageId,
      site_id: site.id,
      before_snapshot_id: before.id,
      after_snapshot_id: after.id,
    },
  });

  return (
    <SectionCard
      title={
        changedCount > 0
          ? `Snapshot comparison — ${changedCount} field${changedCount === 1 ? "" : "s"} changed`
          : "Snapshot comparison — no field changes"
      }
      copy={copy}
      headerExtra={closeButton}
      anchor="snapshot_compare"
    >
      <MatrxDataTable
        urlState={{ id: "page-snapshot-comparison" }}
        data={fields}
        columns={columns}
        getRowId={(field) => field.label}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </SectionCard>
  );
}
