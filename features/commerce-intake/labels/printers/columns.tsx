"use client";

// features/commerce-intake/labels/printers/columns.tsx
//
// Column registry for /commerce/labels/printers. Every column sorts AND
// filters, and every predicate runs server-side over the whole result set
// (see printers/service.ts fetchCertifiedPrinterPage).

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { LABEL_TEMPLATES } from "@ai-matrx/print/labels";

import { TemplatePreviewButton } from "./components/TemplatePreviewButton";
import {
  CERTIFICATION_STATUSES,
  formatCertificationStatus,
  type CertifiedPrinterListRow,
} from "./types";

function statusBadge(status: string) {
  const tone =
    status === "certified"
      ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
      : status === "failed"
        ? "border-destructive/50 text-destructive"
        : "border-amber-500/50 text-amber-600 dark:text-amber-400";
  return (
    <Badge variant="outline" className={`py-0 text-[10px] ${tone}`}>
      {formatCertificationStatus(status)}
    </Badge>
  );
}

export const CERTIFIED_PRINTER_COLUMNS: EntityColumnSpec<CertifiedPrinterListRow>[] =
  [
    {
      id: "printer_make",
      label: "Make",
      locked: true,
      column: {
        id: "printer_make",
        accessorKey: "printer_make",
        header: "Make",
        filter: "text",
        cell: (row) => (
          <span className="truncate font-medium">{row.printer_make}</span>
        ),
      },
    },
    {
      id: "printer_model",
      label: "Model",
      locked: true,
      column: {
        id: "printer_model",
        accessorKey: "printer_model",
        header: "Model",
        filter: "text",
        cell: (row) => <span className="truncate">{row.printer_model}</span>,
      },
    },
    {
      id: "status",
      label: "Result",
      column: {
        id: "status",
        accessorKey: "status",
        header: "Result",
        filter: "select",
        filterOptions: CERTIFICATION_STATUSES.map((s) => ({
          value: s,
          label: formatCertificationStatus(s),
        })),
        cell: (row) => statusBadge(row.status),
      },
    },
    {
      id: "template_id",
      label: "Label stock",
      column: {
        id: "template_id",
        accessorKey: "template_id",
        header: "Label stock",
        filter: "select",
        filterOptions: LABEL_TEMPLATES.map((t) => ({
          value: t.id,
          label: t.name,
        })),
        // NO DEAD ENDS — the stock name opens its calibration preview.
        cell: (row) => <TemplatePreviewButton templateId={row.template_id} />,
      },
    },
    {
      id: "connection_note",
      label: "Connection",
      column: {
        id: "connection_note",
        accessorKey: "connection_note",
        header: "Connection",
        filter: "text",
        cell: (row) =>
          row.connection_note ? (
            <span className="truncate">{row.connection_note}</span>
          ) : (
            <Muted>—</Muted>
          ),
      },
    },
    {
      id: "certified_at",
      label: "Tested",
      column: {
        id: "certified_at",
        accessorKey: "certified_at",
        header: "Tested",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        cell: (row) => timeCell(row.certified_at),
      },
    },
    {
      id: "created_at",
      label: "Added",
      defaultHidden: true,
      column: {
        id: "created_at",
        accessorKey: "created_at",
        header: "Added",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        cell: (row) => timeCell(row.created_at),
      },
    },
  ];
