"use client";

/**
 * KI-001 — CONVERT A MULTIPLIER INTO POINTS, with the arithmetic shown.
 *
 * THE LAW (P18). Worth is additive on an open scale. A value that describes
 * WHAT A KEYWORD IS — "ITAD named", "certification seeking", "business
 * audience" — contributes ±points. Only a RELATIVE QUALIFIER — free, cheap,
 * DIY — scales what the keyword already earned, because it is a modifier on
 * something else rather than a thing in itself. The migrated corpus is nearly
 * all multipliers, so this dialog is the way out.
 *
 * THE ARITHMETIC IS THE PRODUCT. A proposed number a reader cannot check is
 * worse than no proposal: it reads as reasoning and is not. So this screen
 * prints the working —
 *
 *     score = (baseline + points) × multipliers          the resolver
 *     T     = baseline + points  (before any multiplier)
 *     drop f and keep the score  ⇒  (T + A) × factor/f = T × factor
 *                                ⇒  A = T × (f − 1)
 *
 * — over THIS site's real keywords, and proposes the median. T varies per
 * keyword, so the spread is printed too: the median keyword lands exactly where
 * it was, keywords carrying more points than the median land lower, fewer
 * higher. The live preview below says precisely who moves.
 *
 * NOTHING IS AUTO-CONVERTED (P12). This dialog proposes; a person accepts. The
 * write is the ordinary `seo.site_value_worth_upsert`, the same door the
 * suggestion queue and the pack adopter use — no second writer.
 */

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Coins, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { valueSurfaceQueryKeys } from "../rules/data";
import { ImpactPanel } from "../rules/ImpactPanel";
import { describeMultiplier, type BandMeta } from "../lib";
import {
  getWorthConvertBasis,
  previewSiteValueWorth,
  upsertSiteValueWorth,
  type SiteWorthRow,
} from "./data";

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
}

export function WorthConvertDialog({
  siteId,
  window,
  windowLabel,
  bandMetas,
  row,
  onClose,
}: {
  siteId: string;
  window: { start: string; end: string };
  windowLabel: string;
  bandMetas: BandMeta[];
  row: SiteWorthRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const factor = Number(row.amount ?? 1);

  const basis = useQuery({
    queryKey: ["seo", "worth", "basis", siteId, row.value_id, window.start, window.end],
    queryFn: ({ signal }) => getWorthConvertBasis(siteId, row.value_id, window, signal),
    staleTime: 60_000,
  });

  /**
   * Seeded from the server's proposal the moment it lands, and editable after —
   * this is a proposal, not a verdict. `undefined` means "still waiting for the
   * arithmetic", which is why it is not simply an empty string.
   */
  const [amount, setAmount] = useState<string | undefined>(undefined);
  const proposed = basis.data?.proposed_add;
  const effectiveAmount =
    amount ?? (typeof proposed === "number" ? String(proposed) : "");
  const parsed = Number(effectiveAmount.trim());
  const amountOk = effectiveAmount.trim().length > 0 && Number.isFinite(parsed);

  const debounced = useDebounce(effectiveAmount, 450);
  const debouncedParsed = Number(debounced.trim());
  const debouncedOk = debounced.trim().length > 0 && Number.isFinite(debouncedParsed);

  const preview = useQuery({
    queryKey: [
      "seo",
      "worth",
      "preview",
      siteId,
      row.value_id,
      window.start,
      window.end,
      "add",
      debouncedParsed,
    ],
    enabled: debouncedOk,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      previewSiteValueWorth(
        {
          siteId,
          valueId: row.value_id,
          effect: "add",
          amount: debouncedParsed,
          start: window.start,
          end: window.end,
        },
        signal,
      ),
  });

  const save = useMutation({
    mutationFn: () =>
      upsertSiteValueWorth({
        siteId,
        valueId: row.value_id,
        effect: "add",
        amount: parsed,
        origin: "human",
        notes: `Converted from ×${factor} to points — KI-001.`,
      }),
    onSuccess: () => {
      const moved = preview.data?.moved_keywords ?? 0;
      toast.success(`“${row.value_label}” is worth ${signed(parsed)} points`, {
        description:
          moved > 0
            ? `${formatCount(moved)} keyword${moved === 1 ? "" : "s"} changed level.`
            : "No keyword changed level — the scores moved, the bands did not.",
      });
      for (const key of valueSurfaceQueryKeys(siteId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ["seo", "worth"] });
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const data = basis.data;
  const medianT = data?.total_before_factor?.median ?? null;
  const equiv = data?.equivalent_add;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[92dvh] w-[min(60rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" aria-hidden />
            Make “{row.value_label}” worth points
          </DialogTitle>
          <DialogDescription className="text-xs">
            {row.dimension_label} · today it <strong>multiplies</strong> whatever
            the keyword already earned ({describeMultiplier(factor)}). If it
            describes <em>what the keyword is</em> rather than a relative
            qualifier like free, cheap or DIY, it should add points instead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* ── The proposal, with its working ── */}
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain border-border p-4 scrollbar-thin md:border-r">
            {row.relative_qualifier ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] leading-4 text-warning">
                This one reads like a <strong>relative qualifier</strong> — the
                same family as free, cheap and DIY. Those are the values that
                are <em>supposed</em> to multiply, because they modify something
                else rather than being a thing in themselves. Convert it only if
                you disagree.
              </p>
            ) : null}

            {basis.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-24 rounded-md" />
                <Skeleton className="h-10 rounded-md" />
              </div>
            ) : basis.isError ? (
              <InlineQueryError
                what="the conversion arithmetic"
                error={basis.error}
                onRetry={() => void basis.refetch()}
              />
            ) : data?.error ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                {data.message}
              </p>
            ) : (
              <>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    How the number was worked out
                  </p>
                  <p className="mb-2 text-[11px] leading-4 text-muted-foreground">
                    A score is{" "}
                    <span className="font-mono text-foreground">
                      (baseline + points) × multipliers
                    </span>
                    . Call the part before the multipliers{" "}
                    <span className="font-mono text-foreground">T</span>. Taking
                    ×{factor} away and leaving the score where it is means adding{" "}
                    <span className="font-mono text-foreground">
                      T × ({factor} − 1)
                    </span>{" "}
                    points.
                  </p>
                  <Line
                    label={`Keywords carrying this in ${windowLabel}`}
                    value={formatCount(data?.stamped_keywords ?? 0)}
                  />
                  <Line
                    label="…that the multiplier actually acts on today"
                    value={formatCount(data?.contributing_keywords ?? 0)}
                  />
                  <Line
                    label="Their median T (points before multipliers)"
                    value={medianT === null ? "—" : medianT}
                  />
                  <Line
                    label={`Median T × (${factor} − 1)`}
                    value={equiv?.median === null || equiv?.median === undefined ? "—" : signed(equiv.median)}
                  />
                  <Line
                    label="Spread across those keywords"
                    value={
                      equiv?.p25 === null || equiv?.p25 === undefined
                        ? "—"
                        : `${signed(equiv.p25)} … ${signed(equiv.p75 ?? equiv.p25)}`
                    }
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-1.5">
                    <span className="text-[11px] font-medium text-foreground">
                      Proposed, rounded to the nearest 5
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-primary">
                      {typeof proposed === "number" ? signed(proposed) : "—"}
                    </span>
                  </div>
                </div>

                {data?.basis === "pack_formula" ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
                    No keyword with Search Console traffic carries this value
                    with points to multiply, so there is no site distribution to
                    read. The proposal falls back to the ratified starter-pack
                    formula — <span className="font-mono">(f − 1) × 100</span>,
                    the 100 being the baseline every keyword starts from.
                  </p>
                ) : (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    The starter packs convert the same way with T pinned at 100,
                    which for this multiplier would be{" "}
                    <span className="font-semibold text-foreground">
                      {typeof data?.pack_reference_add === "number"
                        ? signed(data.pack_reference_add)
                        : "—"}
                    </span>
                    .
                  </p>
                )}

                {(data?.inert_keywords ?? 0) > 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
                    <strong className="text-foreground">
                      {formatCount(data?.inert_keywords ?? 0)}
                    </strong>{" "}
                    keywords carry this value but have no points yet, so the
                    multiplier does nothing to them at all. Points would — this
                    is the change most worth looking at below.
                  </p>
                ) : null}

                <label className="block space-y-1">
                  <span className="block text-[11px] font-medium text-foreground">
                    Points this value adds
                  </span>
                  <Input
                    value={effectiveAmount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="numeric"
                    className="h-8 text-xs"
                    placeholder="e.g. 200 or -80"
                    aria-label="Points this value adds"
                  />
                  <span className="block text-[10px] leading-4 text-muted-foreground">
                    Negative points demote. The proposal is a starting point, not
                    a verdict — change it and the preview re-measures.
                  </span>
                </label>
              </>
            )}
          </div>

          {/* ── What it does, before anything is saved ── */}
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4 scrollbar-thin">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded border border-border bg-card px-1.5 py-0.5 font-medium tabular-nums text-muted-foreground">
                ×{factor}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
              <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-medium tabular-nums text-primary">
                {amountOk ? `${signed(parsed)} points` : "—"}
              </span>
              {preview.data ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {formatCount(preview.data.changed_score_keywords)} change score
                  · {formatCount(preview.data.moved_keywords)} change level
                </span>
              ) : null}
            </div>
            <ImpactPanel
              impact={preview.data}
              isPending={preview.isPending}
              isFetching={preview.isFetching}
              error={preview.error}
              onRetry={() => void preview.refetch()}
              bandMetas={bandMetas}
              matchedLabel="keywords carry this value"
              incomplete={amountOk ? null : "Enter the points to measure."}
              windowLabel={windowLabel}
              nothingMatchedHint="No keyword with Search Console traffic carries this value in this window, so the change is real but nothing moves today."
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-4 text-muted-foreground">
            Nothing is converted for you. This writes one worth row for this site
            and re-scores immediately; your keyword rulings are untouched.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!amountOk || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {preview.data && amountOk
                ? `Make it ${signed(parsed)} points — ${formatCount(preview.data.moved_keywords)} change level`
                : "Make it points"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
