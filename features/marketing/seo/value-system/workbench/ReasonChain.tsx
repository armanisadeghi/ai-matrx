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

import {
  AlertTriangle,
  CircleHelp,
  Gavel,
  Landmark,
  MapPin,
  SlidersHorizontal,
  TreePine,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import type { ValueReason, ValueSource } from "../types";
import { humanizeSlug } from "../lib";

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
    case "override":
      return {
        icon: Gavel,
        text: "Your ruling",
        detail:
          "An explicit expert ruling — it beats every computed signal until you clear it.",
        tone: "text-primary",
      };
    case "topic":
      return {
        icon: TreePine,
        text: `${reason.topic} · worth ${reason.weight}`,
        detail: reason.negative_guard
          ? `The topic "${reason.topic}" carries a negative guard (not offered / actively avoided), so this keyword is Negative regardless of arithmetic.`
          : `Starts from the topic "${reason.topic}"${reason.root ? ` (a ${humanizeSlug(reason.root).toLowerCase()} root)` : ""}, which you weighted ${reason.weight} out of 100.`,
        tone: reason.negative_guard ? "text-destructive" : undefined,
      };
    case "no_base":
      return {
        icon: Landmark,
        text: "Stamped — no topic worth yet",
        detail:
          "Rules or geo areas matched this keyword (the stamps below), but no topic worth reaches it, so there is nothing for them to multiply. It stays Unvalued until the keyword sits under a topic you have weighted. Stamps never invent value.",
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

/** The full arithmetic, one step per line, for the row detail panel. */
export function ReasonChainDetail({
  reasons,
  source,
}: {
  reasons: ValueReason[];
  source: ValueSource;
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
            </span>
          </li>
        );
      })}
    </ol>
  );
}
