"use client";

/**
 * WHY THIS SCORE — the receipt for ONE keyword, as a floating panel.
 *
 * P25 (never lose the view): asking why a keyword is Platinum must not cost
 * the reader the table they built. This is the same receipt the in-table (i)
 * shows, at a size where every step's editor door is comfortable to click —
 * and it can sit open beside two drill-down panels while the reader works.
 *
 * Multi-instance, keyed on (site, keyword) by the opener, so re-asking about
 * the same keyword focuses the panel that is already open.
 *
 * The receipt comes from `seo.gsc_keyword_value_for` — the ONE resolver. A
 * score is never re-derived here, and a level never renders without its why.
 */

import { useQuery } from "@tanstack/react-query";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { getGscKeywordValueFor } from "@/features/marketing/search-console/data-insights";
import { WhyScoreBody } from "@/features/marketing/seo/value-system/workbench/WhyScore";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";

export interface GscWhyScoreWindowProps {
  onClose: () => void;
  /** The overlay instanceId — doubles as the window-manager id. */
  instanceId: string;
  /** Cascades the initial rect so simultaneous panels never sit occluded. */
  stackIndex?: number;
  siteId: string;
  siteName?: string | null;
  brandId?: string | null;
  keywordId: string;
  keyword?: string | null;
}

export default function GscWhyScoreWindow({
  onClose,
  instanceId,
  stackIndex = 0,
  siteId,
  siteName = null,
  brandId = null,
  keywordId,
  keyword = null,
}: GscWhyScoreWindowProps) {
  const value = useQuery({
    queryKey: ["marketing", "gsc", "keyword-value-for", siteId, [keywordId]],
    queryFn: ({ signal }) => getGscKeywordValueFor(siteId, [keywordId], signal),
    staleTime: 60_000,
  });
  const row = value.data?.get(keywordId) ?? null;

  const cascade = (stackIndex % 8) * 32;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const width = Math.min(460, vw - 32);
  const height = Math.min(520, vh - 32);
  const rect = {
    width,
    height,
    x: Math.max(0, Math.min(vw - width - 48 - cascade, vw - 320)),
    y: Math.max(0, Math.min(vh / 6 + cascade, vh - 240)),
  };

  const title = keyword ? `Why: ${keyword}` : "Why this score";
  const humanCopy = [
    keyword ? `Keyword: ${keyword}` : null,
    row?.value_band ? `Level: ${humanizeSlug(row.value_band)}` : null,
    row?.value_score === null || row?.value_score === undefined
      ? null
      : `Score: ${Math.round(Number(row.value_score))}`,
    siteName ? `Site: ${siteName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <WindowPanel
      id={instanceId}
      title={title}
      initialRect={rect}
      minWidth={320}
      minHeight={240}
      onClose={onClose}
      overlayId="gscWhyScoreWindow"
      overlayInstanceId={instanceId}
      actionsRight={
        <CopyButtons
          size="xs"
          label={title}
          human={humanCopy}
          agent={humanCopy}
          json={() => ({
            site_id: siteId,
            keyword_id: keywordId,
            keyword,
            value_band: row?.value_band ?? null,
            value_score: row?.value_score ?? null,
            value_source: row?.value_source ?? null,
            reasons: row?.reasons ?? [],
          })}
        />
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto bg-background p-3">
        {value.isLoading ? (
          <TableLoadingComponent />
        ) : value.isError ? (
          <InlineQueryError
            what="this keyword's value receipt"
            error={value.error}
            onRetry={() => void value.refetch()}
          />
        ) : !row ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            <p className="font-medium text-warning">
              No value record for this keyword yet
            </p>
            <p className="mt-1 text-muted-foreground">
              It has search performance but nothing this site has said about
              meaning reaches it. Place it on a weighted topic, or rule a level
              directly, and this receipt fills in.
            </p>
          </div>
        ) : (
          <WhyScoreBody
            subject={{
              // C10 — the receipt's location line needs the id to ask which
              // location this keyword belongs to. Without it the panel showed a
              // receipt the in-table (i) did not.
              keywordId,
              keyword,
              valueBand: row.value_band,
              valueScore: row.value_score,
              valueSource: row.value_source,
              reasons: row.reasons,
            }}
            context={{ brandId, siteId, keyword }}
          />
        )}
      </div>
    </WindowPanel>
  );
}
