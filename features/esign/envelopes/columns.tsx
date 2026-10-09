"use client";

// features/esign/envelopes/columns.tsx — column registry for /esign. Plain words: "Waiting",
// "Signed 1 of 2", "Your turn" — never status codes.

import { Badge } from "@/components/ui/badge";
import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { envelopeHref, SIGNER_STATUS_LABEL, statusLabel, type EnvelopeListRow } from "./types";

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  completed: "default",
  sent: "secondary",
  in_progress: "secondary",
  declined: "destructive",
  voided: "outline",
  expired: "outline",
};

export const ENVELOPE_COLUMNS: EntityColumnSpec<EnvelopeListRow>[] = [
  {
    id: "title",
    label: "Document",
    locked: true,
    column: {
      id: "title",
      accessorKey: "title",
      header: "Document",
      filter: "text",
      href: envelopeHref,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.title}</span>
          {row.my_turn && (
            <Badge variant="default" className="shrink-0">
              Your turn
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "status",
    label: "Status",
    column: {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "text",
      cell: (row) => (
        <Badge variant={STATUS_TONE[row.status] ?? "outline"}>
          {statusLabel(row.status)}
        </Badge>
      ),
    },
  },
  {
    id: "progress",
    label: "Signed",
    column: {
      id: "progress",
      accessorKey: "signed_count",
      header: "Signed",
      filter: false,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.signed_count} of {row.signer_count}
        </span>
      ),
    },
  },
  {
    id: "signer_names",
    label: "Signers",
    defaultHidden: true,
    column: {
      id: "signer_names",
      accessorKey: "signer_names",
      header: "Signers",
      filter: "text",
      cell: (row) => (row.signer_names ? <span className="line-clamp-1">{row.signer_names}</span> : <Muted>—</Muted>),
    },
  },
  {
    id: "recipients",
    label: "Each recipient",
    column: {
      id: "recipients",
      // The value IS the text the cell shows ("Ada: Signed, Bo: Pending"): copy, export
      // and search read what the person reads, never the signers array as JSON.
      accessorFn: (row) =>
        row.signers && row.signers.length > 0
          ? row.signers.map((s) => `${s.name}: ${SIGNER_STATUS_LABEL[s.status] ?? s.status}`).join(", ")
          : row.status === "draft"
            ? "Not sent"
            : "",
      header: "Each recipient",
      filter: false,
      cell: (row) =>
        row.signers && row.signers.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
            {row.signers.map((s, i) => (
              <span key={`${s.name}-${i}`} className="whitespace-nowrap text-muted-foreground">
                {s.name}: <span className="text-foreground">{SIGNER_STATUS_LABEL[s.status] ?? s.status}</span>
              </span>
            ))}
          </div>
        ) : (
          <Muted>{row.status === "draft" ? "Not sent" : "—"}</Muted>
        ),
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
  {
    id: "organization_name",
    label: "Organization",
    defaultHidden: true,
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      cell: (row) => row.organization_name ?? <Muted>—</Muted>,
    },
  },
  {
    id: "sent_at",
    label: "Sent",
    column: {
      id: "sent_at",
      accessorKey: "sent_at",
      header: "Sent",
      filter: false,
      cell: (row) => timeCell(row.sent_at),
    },
  },
  {
    id: "updated_at",
    label: "Last activity",
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Last activity",
      filter: false,
      cell: (row) => timeCell(row.updated_at),
    },
  },
];
