"use client";

/**
 * THE KPI BAND — the first thing on the page, and the reason to keep working.
 *
 * Arman, 2026-08-23, on what this page had become: "some of the things that
 * used to be extremely valuable and used to show KPIs to gamify the system for
 * the user got hijacked by the new system, and they've been hidden or have
 * become massively over complicated… half of the page now is just taken up by
 * a bunch of garbage at the top that is completely meaningless."
 *
 * So: four numbers, one row, above everything. Not a dashboard — a scoreboard
 * for a person doing work. Each was chosen because it MOVES and because the
 * expert can move it (the reasoning is on `buildKpis` in ../lib):
 *
 *  1. CLICKS          — the business number. Moves on its own; the denominator.
 *  2. VALUED CLICKS   — clicks carried by keywords that have a level. THE
 *                       gamified one: it rises both when valued traffic grows
 *                       and when the expert rules one more keyword, so an hour
 *                       of classifying shows up in a number the same day.
 *  3. UNVALUED        — the work queue in both currencies (keywords, and the
 *                       clicks they carry), carrying the session button.
 *  4. YOUR RULINGS    — the only number here no arithmetic can move for you,
 *                       with this week's count beside it.
 *
 * NO DEAD ENDS: every tile is a door. 1 clears the table's filters, 2 opens
 * the level breakdown that proves it, 3 filters the table to Unvalued, 4
 * filters it to your own rulings. A number you cannot click into is a claim
 * you cannot check.
 */

import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Gavel,
  Minus,
  Sparkle,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/features/marketing/search-console/types";
import { formatPct, type Delta, type ValueKpis } from "../lib";

function DeltaTag({ delta, label }: { delta: Delta; label: string }) {
  if (delta.dir === "none") return null;
  const tone =
    delta.dir === "up"
      ? "text-success"
      : delta.dir === "down"
        ? "text-destructive"
        : delta.dir === "new"
          ? "text-info"
          : "text-muted-foreground";
  const Icon =
    delta.dir === "up"
      ? ArrowUpRight
      : delta.dir === "down"
        ? ArrowDownRight
        : delta.dir === "new"
          ? Sparkle
          : Minus;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums",
        tone,
      )}
      title={`${label} vs the previous 28 days`}
    >
      <Icon className="h-3 w-3" />
      {delta.dir === "new"
        ? "new"
        : delta.dir === "flat" || delta.pct === null
          ? "flat"
          : formatPct(delta.pct)}
    </span>
  );
}

function Tile({
  label,
  hint,
  value,
  valueTone,
  unit,
  delta,
  deltaLabel,
  sub,
  active,
  onClick,
  doorLabel,
  action,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  valueTone?: string;
  unit?: string;
  delta?: Delta;
  deltaLabel?: string;
  sub: string;
  active?: boolean;
  onClick: () => void;
  doorLabel: string;
  action?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border transition-colors",
        active
          ? "border-primary bg-accent"
          : tone
            ? tone
            : "border-border bg-card hover:border-primary/40",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={`${hint}\n\n${doorLabel}`}
        className="block w-full rounded-lg px-3 py-2 text-left"
      >
        <p className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {delta ? <DeltaTag delta={delta} label={deltaLabel ?? label} /> : null}
        </p>
        <p className="mt-0.5 flex items-baseline gap-1">
          <span
            className={cn(
              "text-2xl font-semibold leading-none tabular-nums",
              valueTone ?? "text-foreground",
            )}
          >
            {value}
          </span>
          {unit ? (
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          ) : null}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</p>
      </button>
      {action ? <div className="px-3 pb-2">{action}</div> : null}
    </div>
  );
}

export function ValueKpiBand({
  kpis,
  rulings,
  isLoading,
  activeBand,
  activeSource,
  onFilterBand,
  onFilterSource,
  onClearFilters,
  onShowLevels,
  onStartSession,
  onQuickAnswers,
  sessionOpen,
}: {
  kpis: ValueKpis | null;
  rulings: { total: number; thisWeek: number } | null;
  isLoading: boolean;
  activeBand: string | null;
  activeSource: string | null;
  onFilterBand: (band: string | null) => void;
  onFilterSource: (source: string | null) => void;
  onClearFilters: () => void;
  onShowLevels: () => void;
  onStartSession: () => void;
  /** KI-054 — opens the floating one-question-five-keywords panel. */
  onQuickAnswers: () => void;
  sessionOpen: boolean;
}) {
  if (isLoading || !kpis) {
    return (
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[88px] rounded-lg" />
        ))}
      </div>
    );
  }

  const noFilter = !activeBand && !activeSource;
  const queueOpen = kpis.unvaluedQueries > 0;

  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
      <Tile
        label="Clicks"
        hint={`Every Search Console click ${formatCount(kpis.totalQueries)} active keywords earned in this window.`}
        value={formatCount(kpis.clicks)}
        delta={kpis.clicksDelta}
        deltaLabel="Site clicks"
        sub={`${formatCount(kpis.totalQueries)} active keywords`}
        active={noFilter}
        onClick={onClearFilters}
        doorLabel="Opens every keyword in the table below."
      />

      <Tile
        label="Valued clicks"
        hint="Clicks carried by keywords that have a level. This rises when valued traffic grows AND every time you rule one more keyword — it is the number your work shows up in."
        value={formatCount(kpis.valuedClicks)}
        valueTone="text-success"
        delta={kpis.valuedClicksDelta}
        deltaLabel="Valued clicks"
        sub={
          kpis.valuedShare === null
            ? "no clicks in this window yet"
            : `${kpis.valuedShare.toFixed(0)}% of your clicks${
                kpis.coverage === null
                  ? ""
                  : ` · ${kpis.coverage.toFixed(0)}% of keywords`
              }`
        }
        onClick={onShowLevels}
        doorLabel="Opens the level breakdown that proves this number."
      />

      <Tile
        label="Unvalued queue"
        hint="Keywords no meaning reaches yet, and the clicks they carry. Until you rule on them, every total on this page understates what you know."
        value={formatCount(kpis.unvaluedQueries)}
        valueTone={queueOpen ? "text-warning" : "text-success"}
        unit="keywords"
        sub={
          queueOpen
            ? `carrying ${formatCount(kpis.unvaluedClicks)} clicks`
            : "nothing left unvalued"
        }
        active={activeBand === "unvalued"}
        tone={
          queueOpen && activeBand !== "unvalued"
            ? "border-warning/50 bg-warning/5 hover:border-warning"
            : undefined
        }
        onClick={() =>
          onFilterBand(activeBand === "unvalued" ? null : "unvalued")
        }
        doorLabel="Opens exactly those keywords in the table below."
        action={
          queueOpen && !sessionOpen ? (
            // TWO WAYS IN, and the fast one leads (KI-054). Quick answers asks
            // ONE question of five keywords in a floating panel, so the table
            // stays live behind it; the ruling session takes the page over and
            // asks everything about one keyword. Most of this queue is cleared
            // by the first, not the second.
            <div className="flex w-full flex-col gap-1">
              <button
                type="button"
                onClick={onQuickAnswers}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-warning/60 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning transition-colors hover:bg-warning/20"
              >
                <BrainCircuit className="h-3 w-3" />
                Answer five at once
              </button>
              <button
                type="button"
                onClick={onStartSession}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-warning hover:text-warning"
              >
                <Gavel className="h-3 w-3" />
                Or rule one at a time
              </button>
            </div>
          ) : null
        }
      />

      <Tile
        label="Your rulings"
        hint="Keywords you personally ruled. An expert ruling beats every computed signal, and it is the training material the AI learns your judgement from — this is the one number arithmetic can never move for you."
        value={formatCount(rulings?.total ?? 0)}
        valueTone={
          (rulings?.total ?? 0) > 0 ? "text-primary" : "text-muted-foreground"
        }
        sub={
          rulings
            ? rulings.thisWeek > 0
              ? `${formatCount(rulings.thisWeek)} in the last 7 days`
              : "none in the last 7 days"
            : "counting…"
        }
        active={activeSource === "override"}
        onClick={() =>
          onFilterSource(activeSource === "override" ? null : "override")
        }
        doorLabel="Opens every keyword you have ruled, in the table below."
      />
    </div>
  );
}
