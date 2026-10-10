"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { toDelimited } from "@ai-matrx/kit/delimited";
import * as React from "react";
import {
  AlertTriangle,
  Calculator,
  ClipboardCopy,
  Info,
  Loader2,
} from "lucide-react";
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
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
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

/** Per-row data for the breakdown table. The math fields (`finalWpi`, `fec`,
 * `wpiAdj`, etc.) come from the backend's structured rating breakdown
 * (`inj.rating.*`), threaded through after the calc has run. They're
 * optional because they're only present when the calc succeeded.
 */
interface InjuryDetailRow {
  index: number;
  impairment: WcImpairmentDefinitionRead;
  side: string;
  acceptsSide: boolean;
  pain: number;
  industrial: number;
  warnings: string[];
  errors: string[];
  // Structured math from the rating pipeline — only present after calc.
  wpi: number | null;
  finalWpi: number | null;
  fec: number | null;
  fecRank: number | null;
  wpiAdj: number | null;
  occupationGroup: string | null;
  occupationLetter: string | null;
  occupAdj: number | null;
  ageAdj: number | null;
  finalPd: number | null;
}

// `rating` was added to StatelessInjuryOut on the backend (Phase 2); the
// generated TS types may not have it yet until `pnpm sync-types`. Read it
// defensively with this shape.
interface InjuryRatingPayload {
  rating?: number | null;
  formula?: string | null;
  wpi?: number | null;
  pain?: number | null;
  final_wpi?: number | null;
  fec?: number | null;
  fec_rank?: number | null;
  wpi_adj?: number | null;
  occupation_group?: string | null;
  occupation_letter?: string | null;
  occup_adj?: number | null;
  age_adj?: number | null;
  industrial?: number | null;
}

function buildInjuryRows(result: StatelessRatingResponse): InjuryDetailRow[] {
  return result.injuries.map((inj, idx) => {
    const acceptsSide = inj.impairment_definition.attributes?.side ?? false;
    const side =
      (inj.injury_attributes as { side?: string } | null)?.side ?? "default";
    const r = (inj as unknown as { rating?: InjuryRatingPayload | null })
      .rating;
    return {
      index: idx,
      impairment: inj.impairment_definition,
      side,
      acceptsSide,
      pain: inj.pain,
      industrial: inj.industrial,
      warnings: inj.warnings,
      errors: inj.errors,
      wpi: r?.wpi ?? null,
      finalWpi: r?.final_wpi ?? null,
      fec: r?.fec ?? null,
      fecRank: r?.fec_rank ?? null,
      wpiAdj: r?.wpi_adj ?? null,
      occupationGroup: r?.occupation_group ?? null,
      occupationLetter: r?.occupation_letter ?? null,
      occupAdj: r?.occup_adj ?? null,
      ageAdj: r?.age_adj ?? null,
      finalPd: r?.rating ?? null,
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

// Render `null`/`undefined` as a dash, ints as ints, floats with 2 decimals
// when not whole. Used for both display and TSV export so numbers line up.
function num(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

const TSV_HEADER = [
  "#",
  "Impairment",
  "AMA Code",
  "Side",
  "WPI",
  "Pain",
  "FinalWPI",
  "FEC",
  "WPI Adj",
  "Group",
  "Letter",
  "OccupAdj",
  "AgeAdj",
  "Industrial",
  "Final PD",
  "Notes",
];

function injuryRowToCells(row: InjuryDetailRow): string[] {
  return [
    String(row.index + 1),
    row.impairment.name,
    row.impairment.impairment_number ?? "—",
    row.acceptsSide ? (SIDE_LABELS[row.side] ?? row.side) : "—",
    num(row.wpi),
    String(row.pain ?? 0),
    num(row.finalWpi),
    num(row.fec),
    num(row.wpiAdj),
    row.occupationGroup ?? "—",
    row.occupationLetter ?? "—",
    num(row.occupAdj),
    num(row.ageAdj),
    `${row.industrial ?? 100}%`,
    num(row.finalPd),
    row.warnings.join(" · "),
  ];
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
    toDelimited(
      [
        TSV_HEADER,
        ...rows.map(injuryRowToCells),
      ],
      { format: "tsv" },
    ),
  );

  return lines.join("\n");
}

function pct(v: number | null | undefined, showZero = false): string {
  if (v == null) return "—";
  if (!showZero && v === 0) return "—";
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(2)}%`;
}

function Mono({ text, strong }: { text: string; strong?: boolean }) {
  return text === "—" ? (
    <Dash />
  ) : (
    <span
      className={cn(
        "font-mono tabular-nums text-foreground",
        strong && "font-semibold",
      )}
    >
      {text}
    </span>
  );
}

function pctColumn(
  id: string,
  header: string,
  get: (row: InjuryDetailRow) => number | null | undefined,
  showZero = false,
): MatrxColumnDef<InjuryDetailRow> {
  return {
    id,
    header,
    accessorFn: (row) => get(row) ?? null,
    copyValue: (row) => pct(get(row), showZero),
    cell: (row) => <Mono text={pct(get(row), showZero)} />,
    filter: "number",
    align: "right",
    width: 96,
  };
}

function plainNum(v: number | string | null | undefined): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  return num(v);
}

const BREAKDOWN_COLUMNS: MatrxColumnDef<InjuryDetailRow>[] = [
  {
    id: "n",
    header: "#",
    accessorFn: (row) => row.index + 1,
    cell: (row) => (
      <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
        {row.index + 1}
      </span>
    ),
    width: 56,
  },
  {
    id: "impairment",
    header: "Impairment",
    accessorFn: (row) => row.impairment.name,
    cell: (row) => (
      <span className="block truncate font-medium text-foreground">
        {row.impairment.name}
      </span>
    ),
    filter: "text",
    frozen: true,
    width: 260,
  },
  {
    id: "ama",
    header: "AMA code",
    accessorFn: (row) => row.impairment.impairment_number ?? "—",
    cell: (row) => (
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {row.impairment.impairment_number ?? "—"}
      </span>
    ),
    filter: "text",
    width: 110,
  },
  {
    id: "side",
    header: "Side",
    accessorFn: (row) =>
      row.acceptsSide ? (SIDE_LABELS[row.side] ?? row.side) : "—",
    filter: "select",
    width: 100,
  },
  pctColumn("wpi", "WPI", (row) => row.wpi),
  {
    id: "pain",
    header: "Pain",
    accessorFn: (row) => row.pain ?? 0,
    cell: (row) => <Mono text={num(row.pain ?? 0)} />,
    filter: "number",
    align: "right",
    width: 80,
  },
  pctColumn("final-wpi", "Final WPI", (row) => row.finalWpi),
  {
    id: "fec",
    header: "FEC",
    accessorFn: (row) => row.fec,
    cell: (row) => <Mono text={plainNum(row.fec)} />,
    copyValue: (row) => plainNum(row.fec),
    filter: "number",
    align: "right",
    width: 80,
  },
  pctColumn("wpi-adj", "WPI Adj", (row) => row.wpiAdj),
  {
    id: "group",
    header: "Group",
    accessorFn: (row) => row.occupationGroup,
    cell: (row) => <Mono text={plainNum(row.occupationGroup)} />,
    copyValue: (row) => plainNum(row.occupationGroup),
    filter: "select",
    align: "right",
    width: 80,
  },
  {
    id: "letter",
    header: "Letter",
    accessorFn: (row) => row.occupationLetter ?? "",
    cell: (row) => <Mono text={row.occupationLetter ?? "—"} />,
    copyValue: (row) => row.occupationLetter ?? "—",
    filter: "select",
    align: "center",
    width: 80,
  },
  pctColumn("occup-adj", "Occup Adj", (row) => row.occupAdj),
  pctColumn("age-adj", "Age Adj", (row) => row.ageAdj),
  pctColumn("industrial", "Industrial", (row) => row.industrial ?? 100, true),
  {
    id: "final-pd",
    header: "Final PD",
    accessorFn: (row) => row.finalPd,
    copyValue: (row) => (row.finalPd != null ? `${row.finalPd}%` : "—"),
    cell: (row) =>
      row.finalPd != null ? <Mono text={`${row.finalPd}%`} strong /> : <Dash />,
    filter: "number",
    align: "right",
    width: 96,
  },
  {
    id: "notes",
    header: "Notes",
    accessorFn: (row) => [...row.errors, ...row.warnings].join(" · "),
    cell: (row) =>
      row.errors.length + row.warnings.length > 0 ? (
        <ul className="space-y-0.5 text-xs">
          {row.errors.map((e, idx) => (
            <li
              key={`e-${idx}`}
              className="flex gap-1 text-destructive"
              title={e}
            >
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-hidden
              />
              <span className="truncate">{e}</span>
            </li>
          ))}
          {row.warnings.map((w, idx) => (
            <li
              key={`w-${idx}`}
              className="flex gap-1 text-amber-700 dark:text-amber-400"
              title={w}
            >
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-hidden
              />
              <span className="truncate">{w}</span>
            </li>
          ))}
        <ErrorAlchemyMenu /></ul>
      ) : (
        <Dash />
      ),
    filter: "text",
    width: 260,
  },
];

const BREAKDOWN_COPY: MatrxDataTableCopyConfig<InjuryDetailRow> = {
  label: "Injury",
  listLabel: "Rating breakdown (this view)",
  location: "Workers' comp PD rating calculator — Rating breakdown",
  rowKind: "pd-rating-injury",
  listKind: "pd-rating-breakdown",
  rowDescription: "One injury's step-by-step PD rating math.",
  listDescription: "Per-injury PD rating math for the current calculation.",
  humanRow: (row) =>
    TSV_HEADER.slice(1)
      .map((label, i) => `${label}: ${injuryRowToCells(row)[i + 1]}`)
      .join("\n"),
};

export function RatingBreakdownTable({
  result,
  isStale,
  className,
}: RatingBreakdownTableProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const rows = React.useMemo(() => buildInjuryRows(result), [result]);
  const combined = result.result?.combined_rating;
  const finalRating = combined?.final_rating;

  const handleCopyAll = async () => {
    if (!(await copyText(buildExportText(result, rows), "Breakdown copied with formulas and per-injury detail"))) return;
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
                icon={<ClipboardCopy />}
                type="button"
                variant="outline"
                onClick={handleCopyAll}
              >
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

      {/* Per-injury math grid. Mirrors the AMA Guides workflow that
          California WC professionals expect to see end-to-end:
          WPI → +Pain → ×FEC → ×Variant → AgeAdj → ×Industrial → Final PD */}
      <MatrxDataTable<InjuryDetailRow>
        tableId="legal/wc/pd-ratings/breakdown"
        data={rows}
        columns={BREAKDOWN_COLUMNS}
        getRowId={(row) => String(row.index)}
        appearance="embedded"
        viewTabs={false}
        pageSize={0}
        density="condensed"
        searchText={(row) =>
          `${row.impairment.name} ${row.impairment.impairment_number ?? ""}`
        }
        toolbar={{ searchPlaceholder: "Search injuries" }}
        detail={{ enabled: false }}
        copy={BREAKDOWN_COPY}
      />

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

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
