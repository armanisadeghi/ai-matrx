"use client";

/**
 * Anchor profile — client-side grouping of the anchor wording from our last
 * check (`useBacklinkAnchorsFull`) via the pure `lib/anchors` analyzer.
 * Warnings first (an over-used phrase is the whole point of the view), then a
 * spread bar + legend, the phrases carrying an outsized share, and a
 * per-group drill list.
 */

import { useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { cn } from "@/styles/themes/utils";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useBacklinkAnchorsFull } from "@/features/marketing/data/backlinks-hooks";
import {
  InlineQueryError,
  LoadingSurface,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { backlinkEmptyHint } from "@/features/marketing/components/backlinks/lib/vocab";
import {
  ANCHOR_CLASSES,
  MIN_LINKS_FOR_WARNINGS,
  analyzeAnchorProfile,
  classifyAnchor,
  type AnchorClassKey,
  type AnchorClassifierContext,
  type AnchorProfileEntry,
  type AnchorProfileRow,
  type AnchorProfileWarning,
} from "@/features/marketing/components/backlinks/lib/anchors";

/** Chart-token swatch per class — topical (the risk class) gets chart-1. */
const CLASS_BAR_CLASSES: Record<AnchorClassKey, string> = {
  branded: "bg-chart-2",
  naked_url: "bg-chart-3",
  generic: "bg-chart-4",
  empty: "bg-chart-5",
  topical: "bg-chart-1",
};

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function BacklinkAnchorProfile({ siteId }: { siteId: string }) {
  const { site } = useMarketingSite();
  const query = useBacklinkAnchorsFull(siteId);
  const [drillClass, setDrillClass] = useState<AnchorClassKey | null>(null);

  if (query.isError) {
    return (
      <InlineQueryError
        what="the wording of your links"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isLoading) return <LoadingSurface label="Loading link wording…" />;

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          No link wording collected yet
        </p>
        <p className="text-xs text-muted-foreground">
          {backlinkEmptyHint("the words other sites use to link to you")}
        </p>
      </div>
    );
  }

  const ctx: AnchorClassifierContext = {
    domain: site.domain || site.root_url,
    brandNames: [site.name],
  };
  const profileRows: AnchorProfileRow[] = rows.map((row) => ({
    anchor: row.label ?? row.dimension_key,
    backlinks: row.backlinks ?? 0,
  }));
  const profile = analyzeAnchorProfile(profileRows, ctx);
  const hasVerdictData = profile.totalBacklinks >= MIN_LINKS_FOR_WARNINGS;

  const drillMeta = drillClass
    ? ANCHOR_CLASSES.find((cls) => cls.key === drillClass)
    : undefined;
  const drillRows = drillClass
    ? profileRows
        .filter(
          (row) =>
            row.backlinks > 0 && classifyAnchor(row.anchor, ctx) === drillClass,
        )
        .sort((a, b) => b.backlinks - a.backlinks)
    : [];
  const profileColumns: MatrxColumnDef<AnchorProfileEntry>[] = [
    {
      id: "label",
      accessorKey: "label",
      header: "Kind of wording",
      filter: "text",
      cellKind: "text",
      cell: (entry) => (
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-sm",
              CLASS_BAR_CLASSES[entry.key],
            )}
          />
          <span
            className={cn(
              "text-foreground",
              entry.key === "topical" && "font-medium",
            )}
          >
            {entry.label}
          </span>
        </span>
      ),
    },
    {
      id: "description",
      accessorFn: (entry) =>
        ANCHOR_CLASSES.find((item) => item.key === entry.key)?.description ??
        "",
      header: "What it means",
      filter: "text",
      sortable: false,
    },
    {
      id: "backlinks",
      accessorKey: "backlinks",
      header: "Backlinks",
      filter: "number",
      align: "right",
      cell: (entry) => entry.backlinks.toLocaleString(),
    },
    {
      id: "share",
      accessorKey: "share",
      header: "Share of links",
      filter: "number",
      align: "right",
      cell: (entry) => pct(entry.share),
    },
    {
      id: "anchorCount",
      accessorKey: "anchorCount",
      header: "Different phrases",
      filter: "number",
      align: "right",
      cell: (entry) => entry.anchorCount.toLocaleString(),
    },
  ];
  const concentratedColumns: MatrxColumnDef<
    (typeof profile.concentrated)[number]
  >[] = [
    {
      id: "anchor",
      accessorKey: "anchor",
      header: "Link wording",
      filter: "text",
      cellKind: "text",
    },
    {
      id: "backlinks",
      accessorKey: "backlinks",
      header: "Backlinks",
      filter: "number",
      align: "right",
      cell: (item) => item.backlinks.toLocaleString(),
    },
    {
      id: "share",
      accessorKey: "share",
      header: "Share of links",
      filter: "number",
      align: "right",
      cell: (item) => pct(item.share),
    },
  ];
  const drillColumns: MatrxColumnDef<AnchorProfileRow>[] = [
    {
      id: "anchor",
      accessorKey: "anchor",
      header: "Link wording",
      filter: "text",
      cellKind: "text",
      cell: (row) => row.anchor || "(no wording)",
    },
    {
      id: "backlinks",
      accessorKey: "backlinks",
      header: "Backlinks",
      filter: "number",
      align: "right",
      cell: (row) => row.backlinks.toLocaleString(),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pb-2">
      {profile.warnings.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {profile.warnings.map((warning, index) => (
            <WarningCallout key={index} warning={warning} />
          ))}
        </div>
      ) : hasVerdictData ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
          The wording of your links looks natural — no phrase is over-used.
        </p>
      ) : null}

      <SectionCard title="What the wording of your links looks like">
        <div className="flex flex-col gap-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {profile.entries
              .filter((entry) => entry.share > 0)
              .map((entry) => (
                <div
                  key={entry.key}
                  className={CLASS_BAR_CLASSES[entry.key]}
                  style={{ width: `${entry.share * 100}%` }}
                  title={`${entry.label} — ${pct(entry.share)}`}
                />
              ))}
          </div>
          <MatrxDataTable
            data={profile.entries}
            columns={profileColumns}
            getRowId={(entry) => entry.key}
            pageSize={10}
            selectedId={drillClass}
            onRowOpen={(entry) =>
              setDrillClass((current) =>
                current === entry.key ? null : entry.key,
              )
            }
          />
        </div>
      </SectionCard>

      {profile.concentrated.length > 0 ? (
        <SectionCard title="Phrases used on an unusually large share of links">
          <MatrxDataTable
            data={profile.concentrated}
            columns={concentratedColumns}
            getRowId={(item) => item.anchor}
            pageSize={10}
          />
        </SectionCard>
      ) : null}

      {drillClass && drillMeta ? (
        <SectionCard
          title={`Most-used wording: ${drillMeta.label.toLowerCase()}`}
          action={{ label: "Clear", onClick: () => setDrillClass(null) }}
        >
          <MatrxDataTable
            data={drillRows}
            columns={drillColumns}
            getRowId={(row) => row.anchor ?? "(empty)"}
            pageSize={10}
            pageSizeOptions={[10, 25, 50, 100]}
            emptyState={{
              title: "No matching link wording",
              description: "No links use this kind of wording.",
            }}
          />
        </SectionCard>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Based on our last check — the {rows.length} most-used phrases, by number
        of links.
      </p>
    </div>
  );
}

function WarningCallout({ warning }: { warning: AnchorProfileWarning }) {
  const critical = warning.severity === "critical";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-2.5 py-2",
        critical
          ? "border-destructive/40 bg-destructive/10"
          : "border-warning/40 bg-warning/10",
      )}
    >
      <TriangleAlert
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          critical ? "text-destructive" : "text-warning",
        )}
      />
      <p className="text-xs text-foreground">{warning.message}</p>
    </div>
  );
}
