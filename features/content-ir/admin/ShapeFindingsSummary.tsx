/**
 * THE FINDING SUMMARY — one card per Shape Doctor finding code, above the
 * matrix on the Board tab.
 *
 * Replaces "read 130 identical red lines and work out which 11 matter". Each
 * card carries the three facts that decide whether an admin should care:
 *
 *   1. HOW MANY of this class are outstanding — always shown, INCLUDING zero.
 *      A class at zero is a status, not an absence.
 *   2. WHETHER IT IS REAL. `Bookkeeping` means a generated file committed in
 *      the repo has gone stale; the system is fine. That distinction was 119
 *      of the 130 reds on 2026-08-26.
 *   3. WHERE IT GETS FIXED, honestly: here, on the kind's page, by a CLI
 *      refresh an agent must run, or by a code change in this repo. A card
 *      never implies a browser click can regenerate a file in the repo.
 *
 * Codes the board physically cannot observe (`measuredOnBoard: false`) say
 * "not measured here" rather than showing a green zero — a count that cannot
 * be non-zero must never read as a pass.
 *
 * Clicking a card opens that code's resolution route. Presentational: the
 * counts come from the ONE server-side doctor run the board already made.
 */

"use client";

import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  FileCode2,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  FINDING_CATALOG_ORDER,
  type FindingCodeSpec,
  type FindingResolutionLane,
} from "@/features/content-ir/admin/shape-finding-catalog";
import { findingCodeHref } from "@/features/content-ir/admin/kind-registry-routes";
import type { FindingCountsByCode } from "@/features/content-ir/admin/kind-detail-types";
import { cn } from "@/lib/utils";

const LANE_LABEL: Record<FindingResolutionLane, string> = {
  "resolve-here": "Resolve here",
  "kind-surface": "Fix on the kind",
  "cli-refresh": "Bookkeeping — CLI refresh",
  "code-change": "Needs a code change",
};

const LANE_ICON: Record<FindingResolutionLane, LucideIcon> = {
  "resolve-here": Wrench,
  "kind-surface": Settings2,
  "cli-refresh": RefreshCw,
  "code-change": FileCode2,
};

const LANE_TONE: Record<FindingResolutionLane, string> = {
  "resolve-here":
    "border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300",
  "kind-surface":
    "border-border bg-muted/40 text-muted-foreground",
  "cli-refresh":
    "border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-300",
  "code-change":
    "border-border bg-muted/40 text-muted-foreground",
};

function CountBadge({
  spec,
  count,
}: {
  spec: FindingCodeSpec;
  count: number;
}) {
  if (!spec.measuredOnBoard) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <CircleSlash className="h-3.5 w-3.5" />
        Not measured here
      </span>
    );
  }
  if (count === 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CircleCheck className="h-3.5 w-3.5" />
        Clear
      </span>
    );
  }
  const isRed = spec.severity === "red";
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-semibold",
        isRed
          ? "text-red-600 dark:text-red-400"
          : "text-amber-600 dark:text-amber-400",
      )}
    >
      {isRed ? (
        <CircleAlert className="h-3.5 w-3.5" />
      ) : (
        <TriangleAlert className="h-3.5 w-3.5" />
      )}
      {count} outstanding
    </span>
  );
}

function FindingCard({
  spec,
  count,
}: {
  spec: FindingCodeSpec;
  count: number;
}) {
  const LaneIcon = LANE_ICON[spec.lane];
  const live = spec.measuredOnBoard && count > 0;
  return (
    <Link
      href={findingCodeHref(spec.code)}
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3 transition-colors",
        "hover:border-primary/50 hover:bg-accent/40",
        live && spec.severity === "red"
          ? "border-red-500/40 bg-red-500/5"
          : live
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-border bg-card",
      )}
      title={spec.what}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {spec.label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            spec.severity === "red"
              ? "bg-red-500/10 text-red-700 dark:text-red-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {spec.severity}
        </span>
      </div>

      <CountBadge spec={spec} count={count} />

      <span className="font-mono text-[10px] text-muted-foreground">
        {spec.code}
      </span>

      <span
        className={cn(
          "mt-auto flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
          LANE_TONE[spec.lane],
        )}
      >
        <LaneIcon className="h-3 w-3 shrink-0" />
        {LANE_LABEL[spec.lane]}
      </span>
    </Link>
  );
}

export default function ShapeFindingsSummary({
  counts,
}: {
  counts: FindingCountsByCode;
}) {
  const outstanding = FINDING_CATALOG_ORDER.filter((spec) => {
    const c = counts[spec.code];
    return spec.measuredOnBoard && c && c.red + c.yellow > 0;
  });
  const bookkeeping = outstanding.filter((s) => s.lane === "cli-refresh").length;
  const real = outstanding.length - bookkeeping;

  return (
    <section className="border-b border-border bg-card px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">
          Findings by class
        </h2>
        <span className="text-xs text-muted-foreground">
          every class the Shape Doctor can raise — {real} class
          {real === 1 ? "" : "es"} with real defects outstanding, {bookkeeping}{" "}
          waiting only on a snapshot refresh
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
        {FINDING_CATALOG_ORDER.map((spec) => {
          const c = counts[spec.code];
          return (
            <FindingCard
              key={spec.code}
              spec={spec}
              count={c ? c.red + c.yellow : 0}
            />
          );
        })}
      </div>
    </section>
  );
}
