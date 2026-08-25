"use client";

/**
 * KI-001 — WHAT YOUR ANSWERS ARE WORTH, and the way out of multipliers.
 *
 * Until this panel a site could WRITE worth (through a receipt, a suggestion,
 * or a pack adoption) and never READ it back: there was no screen anywhere that
 * listed the rulebook it had accumulated. That is a dead end by any reading of
 * the door law, and it is also why the migrated corpus quietly stayed 100%
 * multipliers — nobody could see it to fix it.
 *
 * P18 is the whole point of the list. A value that says WHAT A KEYWORD IS
 * contributes ±points on an open scale; only a relative qualifier (free, cheap,
 * DIY) multiplies what the keyword already earned. Every `scale` row therefore
 * carries the one question worth asking — *does this describe what the keyword
 * is?* — and the button that acts on the answer.
 *
 * P12 — the button opens a PROPOSAL with its arithmetic and a live preview.
 * Nothing converts itself, here or anywhere.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Coins } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { getValueVocabulary } from "../data";
import { buildBandMeta, describeWorth, shortWorth, worthIsDemotion, reviewWindow } from "../lib";
import { listSiteWorth, type SiteWorthRow } from "./data";
import { WorthConvertDialog } from "./WorthConvertDialog";

const WINDOW_LABEL = "the last 28 days";

/**
 * The RPC types `effect` as text because Postgres does. Narrowing it once here
 * beats a cast at every call site — and an unexpected value renders as a plain
 * label rather than lying about the arithmetic.
 */
function worthEffectOf(row: SiteWorthRow): "add" | "scale" | "never" | null {
  return row.effect === "add" || row.effect === "scale" || row.effect === "never"
    ? row.effect
    : null;
}

function WorthChip({ row }: { row: SiteWorthRow }) {
  const effect = worthEffectOf(row);
  const points = effect === "add";
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        effect === "never"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : points
            ? worthIsDemotion(effect, row.amount)
              ? "border-border bg-muted/40 text-muted-foreground"
              : "border-success/40 bg-success/10 text-success"
            : "border-warning/40 bg-warning/10 text-warning",
      )}
      title={describeWorth(effect, row.amount)}
    >
      {shortWorth(effect, row.amount)}
    </span>
  );
}

export function WorthPointsPanel({ siteId }: { siteId: string }) {
  const window = reviewWindow();
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState<SiteWorthRow | null>(null);

  const worth = useQuery({
    queryKey: ["seo", "worth", "list", siteId, window.start, window.end],
    queryFn: ({ signal }) => listSiteWorth(siteId, window, signal),
    staleTime: 60_000,
  });

  const bands = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });

  const rows = worth.data ?? [];
  const multipliers = rows.filter((row) => row.effect === "scale");
  // The ones the law is actually about: a multiplier on a value that does not
  // read as a relative qualifier is describing an identity, and identities pay
  // points. The regex is the same one the ratified pack converter uses, so this
  // screen and the pack content can never disagree about what "relative" means.
  const identityMultipliers = multipliers.filter((row) => !row.relative_qualifier);

  if (worth.isPending) {
    return <Skeleton className="h-11 rounded-lg" aria-hidden />;
  }
  if (worth.isError) {
    return (
      <InlineQueryError
        what="what your answers are worth"
        error={worth.error}
        onRetry={() => void worth.refetch()}
      />
    );
  }
  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Coins className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            What your answers are worth
          </span>
          <span className="block text-[11px] leading-4 text-muted-foreground">
            {formatCount(rows.length)} of your answers change a keyword&apos;s
            score.{" "}
            {identityMultipliers.length > 0 ? (
              <>
                <strong className="text-warning">
                  {formatCount(identityMultipliers.length)}
                </strong>{" "}
                of them multiply, and describe what a keyword <em>is</em> rather
                than being a relative qualifier like free or DIY — those are
                meant to be worth points.
              </>
            ) : (
              "Every multiplier left is a relative qualifier, which is what multiplying is for."
            )}
          </span>
        </span>
      </button>

      {open ? (
        <div className="space-y-1 border-t border-border px-3 py-2.5">
          {rows.map((row) => {
            const convertible = row.effect === "scale";
            return (
              <div
                key={row.value_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-textured px-2.5 py-1.5"
              >
                <WorthChip row={row} />
                <span className="min-w-0 flex-1 basis-full text-[11px] text-foreground sm:basis-auto">
                  <span className="text-muted-foreground">
                    {row.dimension_label}:{" "}
                  </span>
                  {row.value_label}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {formatCount(row.stamped_keywords)} kw ·{" "}
                  {formatCount(row.clicks)}c
                </span>
                {convertible ? (
                  <Button
                    size="sm"
                    variant={row.relative_qualifier ? "ghost" : "outline"}
                    className="h-6 shrink-0 px-2 text-[10px]"
                    onClick={() => setConverting(row)}
                  >
                    {row.relative_qualifier
                      ? "Convert anyway"
                      : "Describes what it IS → points"}
                  </Button>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {row.effect === "add" ? "points" : "flag"}
                  </span>
                )}
              </div>
            );
          })}
          <p className="pt-1 text-[10px] leading-4 text-muted-foreground">
            Points say what a keyword is worth on its own; a multiplier only
            scales what it already earned, so it does nothing at all to a keyword
            with no worth yet. Free, cheap and DIY are the relative qualifiers —
            they are supposed to multiply.
          </p>
        </div>
      ) : null}

      {converting ? (
        <WorthConvertDialog
          siteId={siteId}
          window={{ start: window.start, end: window.end }}
          windowLabel={WINDOW_LABEL}
          bandMetas={buildBandMeta(bands.data ?? [])}
          row={converting}
          onClose={() => setConverting(null)}
        />
      ) : null}
    </section>
  );
}
