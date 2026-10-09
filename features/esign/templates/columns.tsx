"use client";

// features/esign/templates/columns.tsx — column registry for /esign/templates.

import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { templateEditHref, type TemplateRow } from "./types";

export const TEMPLATE_COLUMNS: EntityColumnSpec<TemplateRow>[] = [
  {
    id: "name",
    label: "Template",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Template",
      filter: "text",
      href: (row) => templateEditHref(row.id),
      cell: (row) => <span className="truncate font-medium">{row.name}</span>,
    },
  },
  {
    id: "description",
    label: "Description",
    column: {
      id: "description",
      accessorKey: "description",
      header: "Description",
      filter: "text",
      cell: (row) => (row.description ? <span className="line-clamp-1">{row.description}</span> : <Muted>—</Muted>),
    },
  },
  {
    id: "documents",
    label: "Documents",
    column: { id: "documents", accessorKey: "documents", header: "Documents", filter: false, cell: (row) => (row.documents.length ? <span className="line-clamp-1" title={row.documents.map((d) => d.name ?? "").join(", ")}>{row.documents.map((d) => d.name ?? "Untitled").join(", ")}</span> : <Muted>—</Muted>) },
  },
  {
    id: "roles",
    label: "Roles",
    column: { id: "roles", accessorKey: "roles", header: "Roles", filter: false, cell: (row) => (row.roles.length ? <span className="line-clamp-1">{row.roles.map((r) => r ?? "Role").join(", ")}</span> : <Muted>—</Muted>) },
  },
  {
    id: "organization_name",
    label: "Organization",
    defaultHidden: true,
    column: { id: "organization_name", accessorKey: "organization_name", header: "Organization", filter: "text", cell: (row) => row.organization_name ?? <Muted>—</Muted> },
  },
  {
    id: "updated_at",
    label: "Updated",
    column: { id: "updated_at", accessorKey: "updated_at", header: "Updated", filter: false, cell: (row) => timeCell(row.updated_at) },
  },
];
