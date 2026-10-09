"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { toDelimited } from "@ai-matrx/kit/delimited";
import * as React from "react";
import { Pencil, Trash2, Copy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table";
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

function rowToCells(row: InjuryRowData, index: number): string[] {
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
  ];
}

/** The injuries as spreadsheet TSV, through THE one writer (kit toDelimited). */
export function rowsToTsv(rows: InjuryRowData[]): string {
  if (rows.length === 0) return "";
  return toDelimited([TSV_HEADER, ...rows.map((row, idx) => rowToCells(row, idx))], { format: "tsv" });
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}

function Pct({
  value,
  suffix,
  showZero,
}: {
  value: number | null;
  suffix?: string;
  showZero?: boolean;
}) {
  const hide = value == null || (!showZero && value === 0);
  return hide ? (
    <Dash />
  ) : (
    <span className="font-mono tabular-nums text-foreground">
      {value}
      {suffix}
    </span>
  );
}

const INJURY_COPY: MatrxDataTableCopyConfig<InjuryRowData> = {
  label: "Injury",
  listLabel: "Injuries (this view)",
  location: "Workers' comp PD rating calculator — Injuries",
  rowKind: "pd-injury",
  listKind: "pd-injuries",
  rowDescription: "One injury entered in the PD rating calculator.",
  listDescription: "The injuries entered in the PD rating calculator.",
  humanRow: (row) =>
    TSV_HEADER.slice(1)
      .map((label, i) => `${label}: ${rowToCells(row, 0)[i + 1]}`)
      .join("\n"),
};

export function InjuriesTable({
  rows,
  onEdit,
  onDelete,
}: InjuriesTableProps) {
  const { copyText } = useClipboard({ notify: copyNotify });
  const indexOf = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, idx) => map.set(row.injury.tmpId, idx));
    return map;
  }, [rows]);

  // Warnings open under their row by default; the person can fold them away.
  const [folded, setFolded] = React.useState<ReadonlySet<string>>(new Set());
  const expandedIds = React.useMemo(
    () =>
      new Set(
        rows
          .filter((r) => r.warnings.length > 0 && !folded.has(r.injury.tmpId))
          .map((r) => r.injury.tmpId),
      ),
    [rows, folded],
  );

  const columns = React.useMemo<MatrxColumnDef<InjuryRowData>[]>(
    () => [
      {
        id: "n",
        header: "#",
        accessorFn: (row) => (indexOf.get(row.injury.tmpId) ?? 0) + 1,
        cell: (row) => (
          <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
            {(indexOf.get(row.injury.tmpId) ?? 0) + 1}
          </span>
        ),
        width: 56,
      },
      {
        id: "impairment",
        header: "Impairment",
        accessorFn: (row) => row.definition?.name ?? "(no impairment selected)",
        cell: (row) =>
          row.definition ? (
            <span className="block truncate font-medium text-foreground">
              {row.definition.name}
            </span>
          ) : (
            <span className="italic text-muted-foreground">
              Click to choose an impairment
            </span>
          ),
        filter: "text",
        frozen: true,
        width: 260,
      },
      {
        id: "ama",
        header: "AMA code",
        accessorFn: (row) => row.definition?.impairment_number ?? "—",
        cell: (row) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.definition?.impairment_number ?? <Dash />}
          </span>
        ),
        filter: "text",
        width: 110,
      },
      {
        id: "side",
        header: "Side",
        accessorFn: (row) => sideLabel(row.injury, row.definition),
        filter: "select",
        width: 100,
      },
      {
        id: "wpi",
        header: "WPI",
        accessorFn: (row) => row.injury.wpi,
        copyValue: (row) => pctOrDash(row.injury.wpi),
        cell: (row) => <Pct value={row.injury.wpi} suffix="%" />,
        filter: "number",
        align: "right",
        width: 80,
      },
      {
        id: "ue",
        header: "UE",
        accessorFn: (row) => row.injury.ue,
        copyValue: (row) => pctOrDash(row.injury.ue),
        cell: (row) => <Pct value={row.injury.ue} suffix="%" />,
        filter: "number",
        align: "right",
        width: 80,
      },
      {
        id: "le",
        header: "LE",
        accessorFn: (row) => row.injury.le,
        copyValue: (row) => pctOrDash(row.injury.le),
        cell: (row) => <Pct value={row.injury.le} suffix="%" />,
        filter: "number",
        align: "right",
        width: 80,
      },
      {
        id: "digit",
        header: "Digit",
        accessorFn: (row) => row.injury.digit,
        copyValue: (row) => pctOrDash(row.injury.digit),
        cell: (row) => <Pct value={row.injury.digit} suffix="%" />,
        filter: "number",
        align: "right",
        width: 80,
      },
      {
        id: "pain",
        header: "Pain",
        accessorFn: (row) => row.injury.pain ?? 0,
        cell: (row) => <Pct value={row.injury.pain} showZero />,
        filter: "number",
        align: "right",
        width: 80,
      },
      {
        id: "industrial",
        header: "Industrial",
        accessorFn: (row) => row.injury.industrial ?? 100,
        copyValue: (row) => `${row.injury.industrial ?? 100}%`,
        cell: (row) => <Pct value={row.injury.industrial} suffix="%" showZero />,
        filter: "number",
        align: "right",
        width: 100,
      },
      {
        id: "warnings",
        header: "Warnings",
        accessorFn: (row) => row.warnings.join(" · "),
        filter: "text",
        hidden: true,
        width: 240,
      },
    ],
    [indexOf],
  );

  return (
    <MatrxDataTable<InjuryRowData>
      tableId="legal/wc/pd-ratings/injuries"
      data={rows}
      columns={columns}
      getRowId={(row) => row.injury.tmpId}
      appearance="embedded"
      viewTabs={false}
      pageSize={0}
      density="condensed"
      searchText={(row) =>
        `${row.definition?.name ?? ""} ${row.definition?.impairment_number ?? ""}`
      }
      toolbar={{ searchPlaceholder: "Search injuries" }}
      detail={{ enabled: false }}
      copy={INJURY_COPY}
      onRowOpen={(row) => onEdit(row.injury.tmpId)}
      rowActions={(row) => [
        {
          id: "copy-row",
          icon: Copy,
          label: "Copy row",
          tooltip: "Copy row for Excel or Sheets",
          onClick: () => {
            const index = indexOf.get(row.injury.tmpId) ?? 0;
            void copyText(
              toDelimited([rowToCells(row, index)], { format: "tsv" }),
              `Row ${index + 1} copied — paste into Excel or Sheets`,
            );
          },
        },
        {
          id: "edit",
          icon: Pencil,
          label: "Edit injury",
          onClick: () => onEdit(row.injury.tmpId),
        },
        {
          id: "delete",
          icon: Trash2,
          label: "Delete injury",
          tone: "destructive",
          onClick: () => onDelete(row.injury.tmpId),
        },
      ]}
      expandedDetail={{
        expandedIds,
        onExpandedIdsChange: (next) =>
          setFolded(
            new Set(
              rows
                .filter((r) => r.warnings.length > 0 && !next.has(r.injury.tmpId))
                .map((r) => r.injury.tmpId),
            ),
          ),
        canExpand: (row) => row.warnings.length > 0,
        render: (row) => (
          <div className="flex items-start gap-1.5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <ul className="min-w-0 space-y-0.5">
              {row.warnings.map((warning, wIdx) => (
                <li key={wIdx}>{warning}</li>
              ))}
            </ul>
          </div>
        ),
      }}
      rowClassName={(row) => (!row.definition ? "bg-muted/15" : undefined)}
      emptyState={{ title: "No injuries yet" }}
    />
  );
}
