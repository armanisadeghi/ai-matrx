"use client";

import * as React from "react";
import {
  AlertTriangle,
  Calculator,
  ClipboardCopy,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber } from "../../lib/formulas";
import type {
  StatelessRatingResponse,
  WcImpairmentDefinitionRead,
} from "../../api/types";

interface RatingBreakdownTableProps {
  result: StatelessRatingResponse;
  isStale?: boolean;
  className?: string;
}

const SIDE_LABELS: Record<string, string> = {
  left: "Left",
  right: "Right",
  default: "Bilateral",
};

const SIDE_ORDER = ["left", "right", "default"] as const;

interface InjuryDetailRow {
  index: number;
  impairment: WcImpairmentDefinitionRead;
  side: string;
  acceptsSide: boolean;
  pain: number;
  industrial: number;
  warnings: string[];
  errors: string[];
}

function buildInjuryRows(result: StatelessRatingResponse): InjuryDetailRow[] {
  return result.injuries.map((inj, idx) => {
    const acceptsSide = inj.impairment_definition.attributes?.side ?? false;
    const side =
      (inj.injury_attributes as { side?: string } | null)?.side ?? "default";
    return {
      index: idx,
      impairment: inj.impairment_definition,
      side,
      acceptsSide,
      pain: inj.pain,
      industrial: inj.industrial,
      warnings: inj.warnings,
      errors: inj.errors,
    };
  });
}

function sortSides(sides: string[]): string[] {
  const known = SIDE_ORDER.filter((s) => sides.includes(s));
  const unknown = sides.filter(
    (s) => !SIDE_ORDER.includes(s as (typeof SIDE_ORDER)[number]),
  );
  return [...known, ...unknown];
}

function injuryRowToTsv(row: InjuryDetailRow): string {
  const cells = [
    String(row.index + 1),
    row.impairment.name,
    row.impairment.impairment_number ?? "—",
    row.acceptsSide ? (SIDE_LABELS[row.side] ?? row.side) : "—",
    String(row.pain ?? 0),
    `${row.industrial ?? 100}%`,
    row.warnings.join(" · "),
  ];
  return cells.join("\t");
}

function buildExportText(
  result: StatelessRatingResponse,
  rows: InjuryDetailRow[],
): string {
  const lines: string[] = [];
  const combined = result.result?.combined_rating;
  const compensation = result.result?.compensation;

  lines.push("RATING BREAKDOWN");
  if (combined?.final_rating != null) {
    lines.push(`Final PD: ${formatNumber(combined.final_rating, 0)}%`);
  }
  if (compensation) {
    const parts: string[] = [];
    if (compensation.compensation != null)
      parts.push(`$${formatNumber(compensation.compensation, 2)}`);
    if (compensation.weeks != null)
      parts.push(`${formatNumber(compensation.weeks, 2)} wks`);
    if (compensation.days != null)
      parts.push(`${formatNumber(compensation.days, 0)} days`);
    if (parts.length) lines.push(`Compensation: ${parts.join(" · ")}`);
  }
  lines.push("");

  if (combined?.ratings) {
    lines.push("Per-side breakdown");
    for (const side of sortSides(Object.keys(combined.ratings))) {
      const sideData = combined.ratings[side];
      const label = SIDE_LABELS[side] ?? side;
      lines.push(`  ${label}: ${formatNumber(sideData.total, 0)}%`);
      for (const item of sideData.ratings) {
        lines.push(`    ${item.formula}`);
      }
    }
    lines.push("");
  }

  lines.push("Per-injury detail");
  lines.push(
    ["#", "Impairment", "AMA Code", "Side", "Pain", "Industrial", "Notes"].join(
      "\t",
    ),
  );
  for (const row of rows) {
    lines.push(injuryRowToTsv(row));
  }

  return lines.join("\n");
}

export function RatingBreakdownTable({
  result,
  isStale,
  className,
}: RatingBreakdownTableProps) {
  const rows = React.useMemo(() => buildInjuryRows(result), [result]);
  const combined = result.result?.combined_rating;
  const finalRating = combined?.final_rating;

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildExportText(result, rows));
      toast.success("Breakdown copied", {
        description:
          "Paste anywhere — formulas and per-injury detail included.",
      });
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm",
        isStale && "opacity-70 transition-opacity",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="rounded-md bg-secondary/10 p-1.5 ring-1 ring-secondary/20 shrink-0">
            <Calculator className="h-4 w-4 text-secondary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground tracking-tight flex items-center gap-2">
              Rating breakdown
              {isStale && (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              {finalRating != null
                ? `How ${rows.length} ${
                    rows.length === 1 ? "injury" : "injuries"
                  } combined into a ${formatNumber(finalRating, 0)}% rating.`
                : "Calculation detail per side and per injury."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyAll}
                className="gap-1.5 h-8"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Copy summary, formulas, and per-injury detail
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {combined?.ratings && Object.keys(combined.ratings).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          {sortSides(Object.keys(combined.ratings)).map((side) => {
            const sideData = combined.ratings[side];
            return (
              <SideFormulaCard
                key={side}
                label={SIDE_LABELS[side] ?? side}
                total={sideData.total}
                formulas={sideData.ratings.map((r) => r.formula)}
              />
            );
          })}
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-lg border border-border bg-background/40">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <Th className="w-10 pl-4 text-left">#</Th>
              <Th className="text-left">Impairment</Th>
              <Th className="text-left whitespace-nowrap">AMA code</Th>
              <Th className="text-left">Side</Th>
              <Th className="text-right">Pain</Th>
              <Th className="text-right whitespace-nowrap">Industrial</Th>
              <Th className="text-left whitespace-nowrap">Notes</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BreakdownRow key={row.index} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {combined?.warnings && combined.warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/40 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400 mb-1.5">
            <Info className="h-3 w-3" />
            Calculation notes
          </div>
          <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
            {combined.warnings.map((w, idx) => (
              <li key={idx} className="flex gap-1.5">
                <span aria-hidden>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SideFormulaCard({
  label,
  total,
  formulas,
}: {
  label: string;
  total: number;
  formulas: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono tabular-nums text-lg font-semibold text-foreground">
          {formatNumber(total, 0)}%
        </span>
      </div>
      {formulas.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] font-mono tabular-nums text-muted-foreground">
          {formulas.map((formula, idx) => (
            <li key={idx} className="truncate" title={formula}>
              {formula}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn("px-2 py-2 font-medium whitespace-nowrap", className)}
      scope="col"
    >
      {children}
    </th>
  );
}

function BreakdownRow({ row }: { row: InjuryDetailRow }) {
  const hasNotes = row.warnings.length > 0 || row.errors.length > 0;

  return (
    <>
      <tr className="border-t border-border/60 hover:bg-muted/30 transition-colors">
        <td className="px-2 py-2.5 pl-4 align-top">
          <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
            {row.index + 1}
          </span>
        </td>
        <td className="px-2 py-2.5 align-top min-w-0">
          <span className="font-medium text-foreground">
            {row.impairment.name}
          </span>
        </td>
        <td className="px-2 py-2.5 align-top font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {row.impairment.impairment_number ?? "—"}
        </td>
        <td className="px-2 py-2.5 align-top whitespace-nowrap">
          {row.acceptsSide ? (
            <span className="text-foreground">
              {SIDE_LABELS[row.side] ?? row.side}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </td>
        <td className="px-2 py-2.5 align-top text-right font-mono tabular-nums">
          <span className="text-foreground">{row.pain ?? 0}</span>
        </td>
        <td className="px-2 py-2.5 align-top text-right font-mono tabular-nums whitespace-nowrap">
          <span className="text-foreground">{row.industrial ?? 100}%</span>
        </td>
        <td className="px-2 py-2.5 align-top text-xs text-muted-foreground min-w-[140px]">
          {hasNotes ? (
            <ul className="space-y-0.5">
              {row.errors.map((e, idx) => (
                <li key={`e-${idx}`} className="flex gap-1 text-destructive">
                  <AlertTriangle
                    className="h-3 w-3 mt-0.5 shrink-0"
                    aria-hidden
                  />
                  <span>{e}</span>
                </li>
              ))}
              {row.warnings.map((w, idx) => (
                <li
                  key={`w-${idx}`}
                  className="flex gap-1 text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle
                    className="h-3 w-3 mt-0.5 shrink-0"
                    aria-hidden
                  />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </td>
      </tr>
    </>
  );
}
