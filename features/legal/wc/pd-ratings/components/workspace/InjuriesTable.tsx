"use client";

import * as React from "react";
import { Pencil, Trash2, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { InjuryDraft } from "../../state/types";
import type { WcImpairmentDefinitionRead } from "../../api/types";

const SIDE_LABELS: Record<string, string> = {
  left: "Left",
  right: "Right",
  default: "Bilateral",
};

export interface InjuryRowData {
  injury: InjuryDraft;
  definition: WcImpairmentDefinitionRead | null;
  warnings: string[];
}

interface InjuriesTableProps {
  rows: InjuryRowData[];
  onEdit: (tmpId: string) => void;
  onDelete: (tmpId: string) => void;
  className?: string;
}

const TSV_HEADER = [
  "#",
  "Impairment",
  "AMA code",
  "Side",
  "WPI",
  "UE",
  "LE",
  "Digit",
  "Pain",
  "Industrial",
];

function sideLabel(
  injury: InjuryDraft,
  definition: WcImpairmentDefinitionRead | null,
): string {
  const acceptsSide = definition?.attributes?.side ?? true;
  if (!acceptsSide) return "—";
  return SIDE_LABELS[injury.side] ?? injury.side;
}

function pctOrDash(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

function rowToTsv(row: InjuryRowData, index: number): string {
  const { injury, definition } = row;
  return [
    String(index + 1),
    definition?.name ?? "(no impairment selected)",
    definition?.impairment_number ?? "—",
    sideLabel(injury, definition),
    pctOrDash(injury.wpi),
    pctOrDash(injury.ue),
    pctOrDash(injury.le),
    pctOrDash(injury.digit),
    String(injury.pain ?? 0),
    `${injury.industrial ?? 100}%`,
  ].join("\t");
}

export function rowsToTsv(rows: InjuryRowData[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((row, idx) => rowToTsv(row, idx));
  return [TSV_HEADER.join("\t"), ...lines].join("\n");
}

export function InjuriesTable({
  rows,
  onEdit,
  onDelete,
  className,
}: InjuriesTableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-lg border border-border bg-card",
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <Th className="w-10 pl-4 text-left">#</Th>
            <Th className="text-left">Impairment</Th>
            <Th className="text-left whitespace-nowrap">AMA code</Th>
            <Th className="text-left">Side</Th>
            <Th className="text-right">WPI</Th>
            <Th className="text-right">UE</Th>
            <Th className="text-right">LE</Th>
            <Th className="text-right">Digit</Th>
            <Th className="text-right">Pain</Th>
            <Th className="text-right whitespace-nowrap">Industrial</Th>
            <Th className="pr-2 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <InjuryTableRow
              key={row.injury.tmpId}
              index={idx}
              row={row}
              onEdit={() => onEdit(row.injury.tmpId)}
              onDelete={() => onDelete(row.injury.tmpId)}
            />
          ))}
        </tbody>
      </table>
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

function InjuryTableRow({
  index,
  row,
  onEdit,
  onDelete,
}: {
  index: number;
  row: InjuryRowData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { injury, definition, warnings } = row;
  const acceptsSide = definition?.attributes?.side ?? true;
  const incomplete = !definition;

  const handleCopy = async () => {
    const tsv = rowToTsv(row, index);
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success(`Row ${index + 1} copied`, {
        description: "Tab-separated — paste into Excel or Sheets.",
      });
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <>
      <tr
        className={cn(
          "border-t border-border/60 transition-colors hover:bg-muted/30",
          incomplete && "bg-muted/15",
        )}
      >
        <td className="px-2 py-2.5 pl-4 align-top">
          <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
            {index + 1}
          </span>
        </td>
        <td className="px-2 py-2.5 align-top min-w-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-left w-full truncate rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {definition ? (
              <span className="font-medium text-foreground">
                {definition.name}
              </span>
            ) : (
              <span className="italic text-muted-foreground">
                Click to choose an impairment
              </span>
            )}
          </button>
        </td>
        <td className="px-2 py-2.5 align-top font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {definition?.impairment_number ?? <Dash />}
        </td>
        <td className="px-2 py-2.5 align-top text-foreground whitespace-nowrap">
          {acceptsSide ? SIDE_LABELS[injury.side] ?? injury.side : <Dash />}
        </td>
        <NumberCell value={injury.wpi} suffix="%" />
        <NumberCell value={injury.ue} suffix="%" />
        <NumberCell value={injury.le} suffix="%" />
        <NumberCell value={injury.digit} suffix="%" />
        <NumberCell value={injury.pain} showZero />
        <NumberCell value={injury.industrial} suffix="%" showZero />
        <td className="px-2 py-2.5 pr-2 align-top text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                  aria-label="Copy row"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Copy row</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onEdit}
                  aria-label="Edit injury"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Edit injury</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  aria-label="Delete injury"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Delete injury</TooltipContent>
            </Tooltip>
          </div>
        </td>
      </tr>
      {warnings.length > 0 && (
        <tr className="border-t border-amber-200/50 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
          <td className="pl-4 align-top" />
          <td colSpan={10} className="px-2 py-1.5">
            <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <ul className="space-y-0.5 min-w-0">
                {warnings.map((warning, wIdx) => (
                  <li key={wIdx}>{warning}</li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function NumberCell({
  value,
  suffix,
  showZero,
}: {
  value: number | null;
  suffix?: string;
  showZero?: boolean;
}) {
  const hide = value == null || (!showZero && value === 0);
  return (
    <td className="px-2 py-2.5 align-top text-right font-mono text-sm tabular-nums whitespace-nowrap">
      {hide ? (
        <Dash />
      ) : (
        <span className="text-foreground">
          {value}
          {suffix}
        </span>
      )}
    </td>
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
