"use client";

/**
 * Insights tab — the curated-view layer of the backlinks workspace, mirroring
 * the Search Console Insights "lens" pattern: a pill row of named views, a
 * one-line description of the active view, the view below.
 *
 * Views: the client-side Anchor profile analysis first, then the five
 * server-filtered lenses from `BACKLINK_LENSES` (each rendered by the
 * self-contained `BacklinkObservationTable`, which applies the lens in the
 * database). Active view lives in URL state (`?insight=`) so it survives
 * refresh and is shareable; every other param is preserved.
 */

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Anchor,
  CircleDot,
  ListTodo,
  PencilLine,
  ShieldAlert,
  TrendingUp,
  Trophy,
  Unlink,
  Unlink2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { clearTableUrlParams } from "@/features/marketing/data/query-state";
import {
  BACKLINK_LENSES,
  isBacklinkLensKey,
  type BacklinkLensKey,
} from "@/features/marketing/components/backlinks/lib/vocab";
import { BacklinkAnchorProfile } from "@/features/marketing/components/backlinks/BacklinkAnchorProfile";
import { BacklinkObservationTable } from "@/features/marketing/components/backlinks/BacklinkObservationTable";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import type { BacklinkEnrichmentRunState } from "@/features/marketing/components/backlinks/lib/enrichment-run";

const ANCHOR_PROFILE_KEY = "anchor-profile";

const ANCHOR_PROFILE_DESCRIPTION =
  "How your anchor text distributes across branded, topical, URL, and generic classes — the over-optimization radar.";

type InsightViewKey = typeof ANCHOR_PROFILE_KEY | BacklinkLensKey;

const LENS_ICONS: Record<BacklinkLensKey, LucideIcon> = {
  best: Trophy,
  new: TrendingUp,
  lost: Unlink,
  broken: Unlink2,
  toxic: ShieldAlert,
  actionable: ListTodo,
  relevant: CircleDot,
  controllable: PencilLine,
};

export function BacklinkInsightsTab({
  siteId,
  onAnalyze,
  analysisRuns,
  onDismissAnalysisRun,
  analysisDisabled,
}: {
  siteId: string;
  onAnalyze?: (row: BacklinkObservationRow) => void;
  analysisRuns?: Record<string, BacklinkEnrichmentRunState>;
  onDismissAnalysisRun?: (backlinkId: string) => void;
  analysisDisabled?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startNavigation] = useTransition();

  const raw = searchParams.get("insight");
  const active: InsightViewKey = isBacklinkLensKey(raw)
    ? raw
    : ANCHOR_PROFILE_KEY;

  const selectView = (next: InsightViewKey) => {
    if (next === active) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === ANCHOR_PROFILE_KEY) params.delete("insight");
    else params.set("insight", next);
    // Each lens seeds its own default sort/paging — a stale sort from the
    // previous lens's table must not carry into the next lens's query.
    clearTableUrlParams(params);
    startNavigation(() => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const description =
    active === ANCHOR_PROFILE_KEY
      ? ANCHOR_PROFILE_DESCRIPTION
      : BACKLINK_LENSES.find((lens) => lens.key === active)?.description;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          <ViewPill
            label="Anchor profile"
            icon={Anchor}
            active={active === ANCHOR_PROFILE_KEY}
            onSelect={() => selectView(ANCHOR_PROFILE_KEY)}
          />
          {BACKLINK_LENSES.map((lens) => (
            <ViewPill
              key={lens.key}
              label={lens.label}
              icon={LENS_ICONS[lens.key]}
              active={active === lens.key}
              onSelect={() => selectView(lens.key)}
            />
          ))}
        </div>
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {/* `flex flex-col` is LOAD-BEARING: the lens views below are bounded
          scroll chains (`MatrxDataTable` is `h-full`, its child sets
          `min-h-0 flex-1`). A plain block wrapper here leaves them
          height:auto, so the table grew past the viewport and the page's
          `overflow-hidden` clipped it — no scrollbar at all. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {active === ANCHOR_PROFILE_KEY ? (
          <BacklinkAnchorProfile siteId={siteId} />
        ) : (
          <BacklinkObservationTable
            siteId={siteId}
            lens={active}
            key={active}
            onAnalyze={onAnalyze}
            analysisRuns={analysisRuns}
            onDismissAnalysisRun={onDismissAnalysisRun}
            analysisDisabled={analysisDisabled}
          />
        )}
      </div>
    </div>
  );
}

function ViewPill({
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onClick={onSelect}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
