"use client";

/**
 * The "why" chain — every tier renders WITH its reasons (value-system.md:
 * "a tier without its why must never render"). Two presentations:
 *
 *  - `ReasonChainInline`  — one compact line for the table's Why column.
 *  - `ReasonChainDetail`  — the full step-by-step arithmetic for the side
 *    panel, written for a non-technical expert ("starts at… × rule… → band").
 *
 * An empty chain is never blank: unvalued rows say so honestly, and any
 * other empty chain screams as the data defect it is.
 */

import Link from "next/link";
import {
  AlertTriangle,
  CircleHelp,
  Gavel,
  Landmark,
  Layers2,
  MapPin,
  PencilLine,
  SlidersHorizontal,
  Timer,
  TreePine,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { formatRelativeTime } from "@/utils/datetime";
import type { ValueReason, ValueSource } from "../types";
import { humanizeSlug } from "../lib";
import { reasonEditorLink, type ReasonLinkContext } from "../reason-links";

function multiplierText(multiplier: number): string {
  return `×${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
}

interface ReasonView {
  icon: typeof Gavel;
  text: string;
  detail: string;
  tone?: string;
}

function reasonView(reason: ValueReason): ReasonView {
  switch (reason.kind) {
    case "summary": {
      const baseline = reason.baseline ?? 0;
      const total = reason.total_before_factor ?? reason.adds;
      const factorText = reason.factor
        .toFixed(2)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
      return {
        icon: Landmark,
        text: reason.never
          ? "Never — an explicit flag"
          : reason.score === null
            ? "Nothing is expressed about this keyword yet"
            : `${baseline} ${reason.adds < 0 ? "−" : "+"} ${Math.abs(reason.adds)} = ${total} × ${factorText} = ${reason.score}`,
        detail: reason.never
          ? "A never-flag is set (a not-offered Offering or an out-of-market place). It wins over every other step — the score is zero regardless of what else matched."
          : reason.score === null
            ? "Nothing you have told the system applies to this keyword, so it is honestly unvalued. It is not worth zero — it is unmeasured."
            : `Every score starts at ${baseline}. This keyword's meaning ${reason.adds < 0 ? "subtracted" : "added"} ${Math.abs(reason.adds)}, giving ${total}; then ${reason.n_factors} scaling ${reason.n_factors === 1 ? "factor" : "factors"} multiplied it by ${reason.factor} (capped between 0.05 and 5). Order is always: start, add, scale, then never. Scores never go below zero.`,
        tone: reason.never ? "text-destructive" : undefined,
      };
    }
    case "stamp": {
      // P20 — a situational stamp is a present-tense claim, so it never shows
      // without the moment it was worked out. Reading "parked" with no time
      // behind it invites treating a snapshot as a permanent fact.
      const asOf =
        reason.nature === "situational" && reason.as_of
          ? ` · as of ${formatRelativeTime(reason.as_of, { style: "long" })}`
          : reason.nature === "situational"
            ? " · never evaluated"
            : "";
      return {
        icon: reason.nature === "situational"
          ? Timer
          : reason.dimension.startsWith("site_geo")
            ? MapPin
            : SlidersHorizontal,
        text:
          reason.effect === "never"
            ? `${reason.dimension_label}: ${reason.value_label} — never`
            : reason.effect === "add"
              ? `${reason.dimension_label}: ${reason.value_label} ${reason.amount !== null && reason.amount >= 0 ? "+" : ""}${reason.amount}`
              : `${reason.dimension_label}: ${reason.value_label} ${multiplierText(reason.amount ?? 1)}${asOf}`,
        detail:
          reason.effect === "never"
            ? `This keyword is stamped "${reason.value_label}" (${reason.dimension_label}), which this site marked never — it forces the score to zero.`
            : reason.effect === "add"
              ? `This keyword is stamped "${reason.value_label}" (${reason.dimension_label}); for this site that value adds ${reason.amount} to the score.`
              : `This keyword is stamped "${reason.value_label}" (${reason.dimension_label}); for this site that value scales the score by ${reason.amount}.${reason.source === "human" ? " Stamped by a person." : reason.source === "matcher" ? " Stamped by one of your matchers." : reason.source === "classifier" ? " Stamped by the AI classifier." : ""}${reason.nature === "situational" ? ` This is a situational stamp — it describes where the keyword sits right now, worked out ${reason.as_of ? formatRelativeTime(reason.as_of, { style: "long" }) : "never"}, and it moves as the data moves.` : ""}`,
        tone: reason.effect === "never" ? "text-destructive" : reason.effect === "scale" && (reason.amount ?? 1) < 1 ? "text-warning" : undefined,
      };
    }
    case "combo": {
      // C7 — "two strikes against you". A combination is not the sum of its
      // parts, so the receipt names every value that had to be true at once;
      // reading only the pairing's effect would hide WHY it fired.
      const names = reason.values
        .map((value) => `${value.dimension_label} “${value.value_label}”`)
        .join(" and ");
      const name =
        reason.label ?? reason.values.map((value) => value.value_label).join(" + ");
      return {
        icon: Layers2,
        text:
          reason.effect === "never"
            ? `${name} — never`
            : reason.effect === "add"
              ? `${name} ${reason.amount !== null && reason.amount >= 0 ? "+" : ""}${reason.amount}`
              : `${name} ${multiplierText(reason.amount ?? 1)}`,
        detail:
          `This keyword is ${names} — all at once, which is what this combination looks for. ` +
          (reason.effect === "never"
            ? "Together they are a dead end for this business, so the score is zero no matter what else the keyword has going for it."
            : reason.effect === "add"
              ? `Together they add ${reason.amount} to the score.`
              : `Together they scale the score by ${reason.amount}.`) +
          (reason.notes ? ` ${reason.notes}` : ""),
        tone:
          reason.effect === "never"
            ? "text-destructive"
            : reason.effect === "scale" && (reason.amount ?? 1) < 1
              ? "text-warning"
              : undefined,
      };
    }
    case "override": {
      // KI-051 — the ruling no longer stands alone. When the working-out has
      // moved away from what you ruled, the chain says so ON THE ROW: nothing
      // is overwritten, but a disagreement you cannot see is a disagreement you
      // can never settle.
      const computed = reason.computed_band
        ? `${humanizeSlug(reason.computed_band)}${
            reason.computed_score != null ? ` (${reason.computed_score})` : ""
          }`
        : null;
      const disagrees = reason.agrees === false && computed;
      return {
        icon: Gavel,
        text: disagrees ? `Your ruling · works out to ${computed}` : "Your ruling",
        detail: [
          "An explicit expert ruling — it beats every computed signal until you clear it.",
          computed
            ? disagrees
              ? `The working-out below says ${computed}. Your ruling stands; this is only here so you can see what you are disagreeing with.`
              : `The working-out below agrees: ${computed}.`
            : null,
          reason.note ? `Your reason: ${reason.note}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        tone: disagrees ? "text-warning" : "text-primary",
      };
    }
    case "topic":
      return {
        icon: TreePine,
        text: `${reason.topic} · worth ${reason.weight}`,
        detail: reason.negative_guard
          ? `The topic "${reason.topic}" carries a negative guard (not offered / actively avoided), so this keyword is Negative regardless of arithmetic.`
          : `Starts from the topic "${reason.topic}"${reason.root ? ` (a ${humanizeSlug(reason.root).toLowerCase()} root)` : ""}, which you weighted ${reason.weight} out of 100.`,
        tone: reason.negative_guard ? "text-destructive" : undefined,
      };
    case "baseline":
      return {
        icon: Landmark,
        text: `Starts at ${reason.amount}`,
        detail: `Every keyword starts from the same neutral point — ${reason.amount} — so a score below it reads as worse than neutral and above it as better. Your site can change that starting point.`,
      };
    case "no_base":
      // Pre-2026-08-25 cached receipts only; the baseline made this impossible.
      return {
        icon: Landmark,
        text: "Stamped — recorded before the baseline existed",
        detail:
          "This receipt was cached before every score started from a baseline. Re-open the keyword to recompute it.",
        tone: "text-muted-foreground",
      };
    case "rule":
      return {
        icon: SlidersHorizontal,
        text: `${reason.name} ${multiplierText(reason.multiplier)}`,
        detail: `Your rule "${reason.name}" matched and multiplied the score by ${reason.multiplier}.`,
        tone: reason.multiplier < 1 ? "text-warning" : undefined,
      };
    case "geo":
      return {
        icon: MapPin,
        text: `${reason.area}: ${humanizeSlug(reason.band)} ${multiplierText(reason.multiplier)}`,
        detail: `Geo intent matched "${reason.area}", which sits in your "${humanizeSlug(reason.band)}" geo band (${multiplierText(reason.multiplier)}).`,
        tone: reason.multiplier <= 0 ? "text-destructive" : undefined,
      };
    default:
      return {
        icon: CircleHelp,
        text: "Unknown step",
        detail: `The resolver recorded a step this page does not recognize yet: ${JSON.stringify(reason)}.`,
        tone: "text-warning",
      };
  }
}

/** Compact single-line chain for the table. Full sentences live in `title`. */
export function ReasonChainInline({
  reasons,
  source,
}: {
  reasons: ValueReason[];
  source: ValueSource;
}) {
  if (!reasons || reasons.length === 0) {
    if (source === "unvalued") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-warning">
          <CircleHelp className="h-3 w-3 shrink-0" />
          No meaning expressed yet — pick a tier or add topic worth
        </span>
      );
    }
    // A valued tier with no recorded why is a resolver defect — scream.
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Missing reasons for a {source} tier — report this
      </span>
    );
  }
  return (
    <span
      className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
      title={reasons.map((r) => `• ${reasonView(r).detail}`).join("\n")}
    >
      {reasons.map((reason, index) => {
        const view = reasonView(reason);
        const Icon = view.icon;
        return (
          <span
            key={index}
            className="inline-flex min-w-0 items-center gap-1 text-[11px]"
          >
            {index > 0 ? (
              <span className="text-muted-foreground/60">→</span>
            ) : null}
            <Icon
              className={cn(
                "h-3 w-3 shrink-0",
                view.tone ?? "text-muted-foreground",
              )}
            />
            <span className={cn("truncate", view.tone ?? "text-foreground/90")}>
              {view.text}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The full arithmetic, one step per line, for the row detail panel.
 *
 * Pass `linkContext` and every step gains the door to the screen where THAT
 * step is changed (reason-links.ts) — the loop that turns an explanation into
 * something the reader can act on. Without it the chain still renders; it just
 * explains without offering the edit.
 */
export function ReasonChainDetail({
  reasons,
  source,
  linkContext,
}: {
  reasons: ValueReason[];
  source: ValueSource;
  linkContext?: ReasonLinkContext;
}) {
  if (!reasons || reasons.length === 0) {
    if (source === "unvalued") {
      return (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          <p className="font-medium text-warning">
            This keyword is honestly unvalued.
          </p>
          <p className="mt-1 text-muted-foreground">
            No topic worth reaches it and none of your rules fire — the system
            never guesses a middle tier. Rule a tier directly below, or give
            its topic a worth in the meaning panel so keywords like it value
            themselves.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Missing explanation
        </p>
        <p className="mt-1 text-muted-foreground">
          A {source} tier arrived without its reasons chain. That should never
          happen — the resolver records its work on every number.
        </p>
      </div>
    );
  }
  return (
    <ol className="space-y-1.5">
      {reasons.map((reason, index) => {
        const view = reasonView(reason);
        const Icon = view.icon;
        const door = linkContext ? reasonEditorLink(reason, linkContext) : null;
        return (
          <li key={index} className="flex items-start gap-2 text-xs">
            <Icon
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                view.tone ?? "text-muted-foreground",
              )}
            />
            <span className="min-w-0">
              <span className={cn("font-medium", view.tone)}>{view.text}</span>
              <span className="block text-muted-foreground">{view.detail}</span>
              {door ? (
                <Link
                  href={door.href}
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <PencilLine className="h-3 w-3 shrink-0" />
                  {door.label}
                </Link>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
