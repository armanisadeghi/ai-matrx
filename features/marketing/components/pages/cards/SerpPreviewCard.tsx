"use client";

import { Badge } from "@/components/ui/badge";
import type {
  MarketingPage,
  PageSnapshot,
} from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { SerpResult, type SerpDevice } from "@/features/marketing/seo/serp/SerpResult";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import { MetaRecommendations } from "@/features/marketing/seo/serp/MetaRecommendations";
import {
  evaluateMetaTitle,
  evaluateMetaDescription,
  type MetaEvaluation,
} from "@/features/marketing/seo/serp/metrics";
import { cn } from "@/lib/utils";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/** Observed vs desired: the editorial diff line under the SERP preview. */
function IntentDiffRow({
  label,
  observed,
  desired,
  metrics,
}: {
  label: string;
  observed: string | null;
  desired: string | null;
  /** Deterministic evaluation of the DESIRED value (null when unset). */
  metrics: MetaEvaluation | null;
}) {
  const state = !desired ? "none" : observed === desired ? "match" : "differs";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {state === "match" ? (
          <Badge variant="success" className="text-[10px]">
            Matches
          </Badge>
        ) : state === "differs" ? (
          <Badge variant="warning" className="text-[10px]">
            Differs from live
          </Badge>
        ) : null}
        {desired && metrics ? (
          <SerpFieldChips
            chars={metrics.charCount}
            pixels={metrics.pixelWidth}
            ok={metrics.ok}
          />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-0.5 break-words text-xs",
          state === "none" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {desired || "No editorial target set"}
      </p>
    </div>
  );
}

export type SerpPreviewProps = {
  page: MarketingPage;
  snapshot: PageSnapshot | null;
  device: SerpDevice;
};

/**
 * Search result preview — renders the canonical SerpResult (features/marketing/seo/serp)
 * for the OBSERVED metadata with a desktop/mobile toggle, deterministic
 * pixel/char chips, the observed-vs-desired editorial diff, and condensed
 * recommendations. The section header carries the "open in Search Appearance"
 * window-panel launcher.
 */
export function SerpPreview({ page, snapshot, device }: SerpPreviewProps) {
  const head = snapshot
    ? parseSnapshotHeadTags(snapshot.head_tags)
    : parseSnapshotHeadTags(null);
  const title = head.title;
  const description = head.metaDescription;

  const titleEval = title ? evaluateMetaTitle(title) : null;
  const descEval = description ? evaluateMetaDescription(description) : null;
  const desiredTitleEval = page.meta_title_desired
    ? evaluateMetaTitle(page.meta_title_desired)
    : null;
  const desiredDescEval = page.meta_description_desired
    ? evaluateMetaDescription(page.meta_description_desired)
    : null;

  return (
    <div className="grid gap-3 p-3">
      <div className="rounded-lg border border-border bg-background px-4 py-3">
        <SerpResult
          url={page.url}
          title={title ?? undefined}
          description={description ?? undefined}
          device={device}
          density="compact"
          placeholderTitle="No observed title"
          placeholderDescription="No observed meta description — search engines will improvise one."
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2">
          <span data-surface-value="observed_title">
            {titleEval ? (
              <SerpFieldChips
                prefix="Title"
                chars={titleEval.charCount}
                pixels={titleEval.pixelWidth}
                ok={titleEval.ok}
              />
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Title —
              </span>
            )}
          </span>
          <span data-surface-value="observed_description">
            {descEval ? (
              <SerpFieldChips
                prefix="Description"
                chars={descEval.charCount}
                pixels={descEval.pixelWidth}
                ok={descEval.ok}
              />
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Description —
              </span>
            )}
          </span>
        </div>
      </div>

      {titleEval?.issues.length || descEval?.issues.length ? (
        <MetaRecommendations
          titleEval={titleEval}
          descriptionEval={descEval}
          issuesOnly
          compact
        />
      ) : null}

      <div className="grid gap-2.5">
        <IntentDiffRow
          label={L.desired_title}
          observed={title}
          desired={page.meta_title_desired}
          metrics={desiredTitleEval}
        />
        <IntentDiffRow
          label={L.desired_description}
          observed={description}
          desired={page.meta_description_desired}
          metrics={desiredDescEval}
        />
      </div>
    </div>
  );
}
