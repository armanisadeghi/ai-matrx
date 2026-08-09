"use client";

/**
 * Anchor profile — client-side classification of the latest stored anchor
 * snapshot (`useBacklinkAnchorsFull`) via the pure `lib/anchors` analyzer.
 * Warnings first (over-optimization is the whole point of the view), then a
 * stacked distribution bar + legend, concentrated anchors, and a per-class
 * drill list.
 */

import { useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useBacklinkAnchorsFull } from "@/features/marketing/data/backlinks-hooks";
import {
  InlineQueryError,
  LoadingSurface,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  ANCHOR_CLASSES,
  MIN_LINKS_FOR_WARNINGS,
  analyzeAnchorProfile,
  classifyAnchor,
  type AnchorClassKey,
  type AnchorClassifierContext,
  type AnchorProfileRow,
  type AnchorProfileWarning,
} from "@/features/marketing/components/backlinks/lib/anchors";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

const DRILL_LIMIT = 25;

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
        what="the anchor snapshot"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isLoading) return <LoadingSurface label="Loading anchors…" />;

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card/60 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          No anchor data stored
        </p>
        <p className="text-xs text-muted-foreground">
          Run a Monthly detail or Full bootstrap refresh.
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
        .slice(0, DRILL_LIMIT)
    : [];

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
          Anchor distribution looks natural.
        </p>
      ) : null}

      <SectionCard title="Distribution">
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
          <div className="overflow-x-auto">
            <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Class</th>
                  <th className="py-1 pr-3 font-medium">Description</th>
                  <th className="py-1 pr-3 text-right font-medium">
                    Backlinks
                  </th>
                  <th className="py-1 pr-3 text-right font-medium">Share</th>
                  <th className="py-1 text-right font-medium">Anchors</th>
                </tr>
              </thead>
              <tbody>
                {profile.entries.map((entry) => {
                  const meta = ANCHOR_CLASSES.find(
                    (cls) => cls.key === entry.key,
                  );
                  const selected = drillClass === entry.key;
                  return (
                    <tr
                      key={entry.key}
                      className={cn(
                        "cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/60",
                        selected && "bg-accent",
                      )}
                      onClick={() =>
                        setDrillClass(selected ? null : entry.key)
                      }
                    >
                      <td className="py-1.5 pr-3">
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
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {meta?.description}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                        {entry.backlinks.toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                        {pct(entry.share)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {entry.anchorCount.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      {profile.concentrated.length > 0 ? (
        <SectionCard title="Anchors carrying an outsized share">
          <div className="overflow-x-auto">
            <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">Anchor</th>
                  <th className="py-1 pr-3 text-right font-medium">
                    Backlinks
                  </th>
                  <th className="py-1 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {profile.concentrated.map((item) => (
                  <tr
                    key={item.anchor}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="sm:max-w-md sm:truncate py-1.5 pr-3 text-foreground">
                      {item.anchor}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                      {item.backlinks.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-foreground">
                      {pct(item.share)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {drillClass && drillMeta ? (
        <SectionCard
          title={`Top ${drillMeta.label.toLowerCase()} anchors`}
          action={{ label: "Clear", onClick: () => setDrillClass(null) }}
        >
          {drillRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No anchors with links in this class.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
                <tbody>
                  {drillRows.map((row) => (
                    <tr
                      key={row.anchor ?? "(empty)"}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <td className="sm:max-w-md sm:truncate py-1 pr-3 text-foreground">
                        {row.anchor || "(no anchor text)"}
                      </td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">
                        {row.backlinks.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Based on the latest stored anchor snapshot (top {rows.length} anchors
        by link count).
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
