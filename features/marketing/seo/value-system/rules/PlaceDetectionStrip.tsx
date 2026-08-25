"use client";

/**
 * THE PLACE-DETECTION SCOREBOARD — how much of this site's search demand has
 * been read for places, and what that found.
 *
 * WHY IT SITS HERE (I3, 2026-08-22): the geo half of the value model can be
 * inert in TWO different ways, and only one of them was ever visible. The known
 * one is an area with no places in it — the warning below the areas list. The
 * hidden one is the other side of the same match: a perfectly configured area
 * still matches nothing if the keywords were never read for the places they
 * name. A strip that says "3,600 of 67,884 keywords scanned" is the difference
 * between a feature that is off and a feature that looks on.
 *
 * SERVER STATE, LIKE ITS SIBLING. `seo.keyword_place_status` is a ledger read,
 * so the number survives the tab, exactly like the universal-facet strip it is
 * modelled on. The button advances that ledger by ONE bounded pass — the batch
 * size is a `platform.feature_knob` row read here, never a constant, because a
 * pass sized in code is a ceiling nobody can turn.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MapPinned, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import {
  getPlaceDetectionStatus,
  placeDetectionQueryKey,
  runPlaceDetectionPass,
  valueSurfaceQueryKeys,
} from "./data";

/** The knob namespace this strip obeys. Missing rows raise — by design. */
const KNOB_FEATURE = "seo.keyword_place_detection";

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function PlaceDetectionStrip({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [lastPass, setLastPass] = useState<string | null>(null);

  const knobs = useQuery({
    queryKey: ["seo", "value-rules", "place-knobs"],
    queryFn: () => fetchFeatureKnobValues(KNOB_FEATURE),
    staleTime: 5 * 60_000,
  });
  const batchKeywords = Number(knobs.data?.batch_keywords ?? 0);
  const minImpressions = Number(knobs.data?.min_impressions ?? 0);

  const status = useQuery({
    queryKey: [...placeDetectionQueryKey(siteId), minImpressions],
    enabled: knobs.isSuccess,
    staleTime: 30_000,
    queryFn: ({ signal }) => getPlaceDetectionStatus(siteId, minImpressions, signal),
  });

  const pass = useMutation({
    mutationFn: () => runPlaceDetectionPass(batchKeywords, minImpressions),
    onSuccess: (result) => {
      setLastPass(
        // KI-044 — a pass held back by autonomy read zero keywords, and
        // "nothing left above the demand floor" would be a lie about why.
        result.skipped
          ? result.skipped === "autonomy_off"
            ? "Place detection is turned off, so nothing ran. Change it under How much the AI may do on its own."
            : "Place detection is set to wait for a person, and this pass covers every site's shared keywords — so there is nobody it can ask. Nothing ran."
          : result.claimed === 0
          ? "Nothing left above the demand floor."
          : `Read ${formatCount(result.claimed)} keywords · ${formatCount(
              result.keywords_with_places,
            )} name a place · ${formatCount(result.local_intent_stamped)} newly flagged local${
              result.human_protected > 0
                ? ` · ${formatCount(result.human_protected)} left alone because a person had ruled on them`
                : ""
            }.`,
      );
      for (const key of valueSurfaceQueryKeys(siteId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  if (knobs.isError) {
    return (
      <InlineQueryError
        what="the place-detection settings"
        error={knobs.error}
        onRetry={() => void knobs.refetch()}
      />
    );
  }
  if (status.isError) {
    return (
      <InlineQueryError
        what="place-detection progress"
        error={status.error}
        onRetry={() => void status.refetch()}
      />
    );
  }

  const row = status.data;
  if (!row) return null;

  const owed = Math.max(row.queue_pending - row.queue_deferred, 0);
  const complete = owed === 0;
  const scannedShare = pct(row.queue_scanned, row.queue_total);
  const siteLocalShare = pct(row.site_keywords_local ?? 0, row.site_keywords ?? 0);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-lg border p-2",
        complete ? "border-border bg-card" : "border-primary/40 bg-accent/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <MapPinned className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs font-medium text-foreground">
          Place detection{" "}
          <span className="font-normal text-muted-foreground">
            — which searches name a real city, state, or “near me”
          </span>
        </p>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Check className="h-3 w-3" aria-hidden /> Demand read
          </span>
        ) : (
          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary">
            {formatCount(owed)} keywords unread
          </span>
        )}
        {row.areas_with_places === 0 && row.areas_total > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
            title="Detection can only change a keyword's worth once one of your areas names a place."
          >
            <TriangleAlert className="h-3 w-3" aria-hidden />
            no area names a place yet
          </span>
        ) : null}
        {isSuperAdmin ? (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={complete ? "outline" : "default"}
              className="h-6 gap-1 text-[11px]"
              disabled={pass.isPending || complete || !knobs.isSuccess}
              title={
                complete
                  ? "Every keyword above the demand floor has been read"
                  : `Read the next ${formatCount(batchKeywords)} highest-demand keywords, starting with “${row.next_phrase ?? ""}”`
              }
              onClick={() => pass.mutate()}
            >
              {pass.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              Read {formatCount(batchKeywords)} more
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Demand read
          </p>
          <p className="text-[11px] tabular-nums text-foreground">
            {formatCount(row.queue_scanned)} of {formatCount(row.queue_total)} keywords
            <span className="text-muted-foreground"> ({scannedShare.toFixed(scannedShare >= 10 ? 0 : 1)}%)</span>
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(scannedShare, 100)}%` }}
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Local on this site
          </p>
          <p className="text-[11px] tabular-nums text-foreground">
            {formatCount(row.site_keywords_local ?? 0)} of{" "}
            {formatCount(row.site_keywords ?? 0)} keywords
            <span className="text-muted-foreground">
              {" "}
              ({siteLocalShare.toFixed(siteLocalShare >= 10 ? 0 : 1)}%)
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatCount(row.site_local_clicks ?? 0)} of{" "}
            {formatCount(row.site_clicks ?? 0)} clicks came from searches that
            named a place, over the last {row.demand_window_days} days.
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Your areas
          </p>
          <p className="text-[11px] tabular-nums text-foreground">
            {formatCount(row.areas_with_places)} of {formatCount(row.areas_total)} name a
            gazetteer place
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {row.areas_empty > 0
              ? `${formatCount(row.areas_empty)} still hold nothing at all, so they match no search.`
              : "Every area holds at least one place or word."}
          </p>
        </div>
      </div>

      {lastPass ? (
        <p className="text-[10px] text-muted-foreground">{lastPass}</p>
      ) : null}
      {row.queue_deferred > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          {formatCount(row.queue_deferred)} keywords sit below the demand floor and
          are deferred, not forgotten — the floor is a setting, and this is what it
          currently costs.
        </p>
      ) : null}
    </div>
  );
}
