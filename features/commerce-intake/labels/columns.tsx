"use client";

// features/commerce-intake/labels/columns.tsx
//
// Column registry for /commerce/labels (label batches — print runs).

import { Badge } from "@/components/ui/badge";
import {
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { getLabelTemplate } from "@/lib/label-print/label-templates";
import { labelBatchHref, type LabelBatchListRow } from "./types";

export const BATCH_STATES = ["open", "printed", "exhausted", "void"] as const;

export function formatBatchState(value: string): string {
  switch (value) {
    case "open":
      return "Open";
    case "printed":
      return "Printed";
    case "exhausted":
      return "Exhausted";
    case "void":
      return "Voided";
    default:
      return value;
  }
}

function stateBadge(state: string) {
  const tone =
    state === "open"
      ? "border-primary/40 text-primary"
      : state === "printed"
        ? "border-border text-foreground"
        : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={`py-0 text-[10px] ${tone}`}>
      {formatBatchState(state)}
    </Badge>
  );
}

function templateName(id: string): string {
  return getLabelTemplate(id)?.name ?? id;
}

export const LABEL_BATCH_COLUMNS: EntityColumnSpec<LabelBatchListRow>[] = [
  {
    id: "purpose",
    label: "Purpose",
    locked: true,
    column: {
      id: "purpose",
      accessorKey: "purpose",
      header: "Purpose",
      filter: "text",
      // THE DOOR LAW — the name is a real link.
      href: labelBatchHref,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">
            {row.purpose || `Label run ${row.created_at.slice(0, 10)}`}
          </span>
          {row.code_prefix && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {row.code_prefix}
            </span>
          )}
        </div>
      ),
    },
  },
  {
    id: "state",
    label: "State",
    column: {
      id: "state",
      accessorKey: "state",
      header: "State",
      filter: "select",
      filterOptions: BATCH_STATES.map((s) => ({
        value: s,
        label: formatBatchState(s),
      })),
      cell: (row) => stateBadge(row.state),
    },
  },
  {
    id: "requested_count",
    label: "Codes",
    column: {
      id: "requested_count",
      accessorKey: "requested_count",
      header: "Codes",
      filter: false,
      cell: (row) => (
        <span className="tabular-nums">{row.requested_count}</span>
      ),
    },
  },
  {
    id: "template_id",
    label: "Template",
    column: {
      id: "template_id",
      accessorKey: "template_id",
      header: "Template",
      filter: "text",
      cell: (row) => <span>{templateName(row.template_id)}</span>,
    },
  },
  {
    id: "printed_at",
    label: "Printed",
    column: {
      id: "printed_at",
      accessorKey: "printed_at",
      header: "Printed",
      filter: false,
      cell: (row) =>
        row.printed_at ? timeCell(row.printed_at) : <Muted>—</Muted>,
    },
  },
  {
    id: "created_at",
    label: "Created",
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: false,
      cell: (row) => timeCell(row.created_at),
    },
  },
];
