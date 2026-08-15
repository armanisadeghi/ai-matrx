"use client";
import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import type { InitiativeListRow } from "./types";

export const INITIATIVE_COLUMNS: EntityColumnSpec<InitiativeListRow>[] = [
  {
    id: "name",
    label: "Name",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      editable: "string",
      editTrigger: "pencil",
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
  },
  {
    id: "description",
    label: "Description",
    defaultHidden: true,
    column: {
      id: "description",
      accessorKey: "description",
      header: "Description",
      filter: "text",
      cell: (r) =>
        r.description ? (
          <span className="line-clamp-1">{r.description}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "brand_name",
    label: "Brand",
    facet: "brand",
    column: {
      id: "brand_name",
      accessorKey: "brand_name",
      header: "Brand",
      filter: "select",
      cell: (r) =>
        r.brand_id ? (
          <EntityRef
            token="web_brand"
            id={r.brand_id}
            name={r.brand_name ?? "Brand"}
          />
        ) : (
          <Muted>All brands</Muted>
        ),
    },
  },
  {
    id: "status",
    label: "Status",
    facet: "status",
    column: {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      editable: "select",
      editOptions: ["draft", "active", "paused", "completed", "archived"].map(
        (value) => ({ value, label: value }),
      ),
      cell: (r) => <Badge variant="outline">{r.status}</Badge>,
    },
  },
  {
    id: "objective",
    label: "Objective",
    facet: "objective",
    column: {
      id: "objective",
      accessorKey: "objective",
      header: "Objective",
      filter: "select",
      editable: "select",
      editOptions: [
        "awareness",
        "acquisition",
        "conversion",
        "retention",
        "launch",
        "seasonal",
        "other",
      ].map((value) => ({ value, label: value })),
      cell: (r) => <span className="capitalize">{r.objective}</span>,
    },
  },
  {
    id: "goal",
    label: "Goal",
    column: {
      id: "goal",
      accessorKey: "goal",
      header: "Goal",
      filter: "text",
      editable: "string",
      editTrigger: "pencil",
      cell: (r) =>
        r.goal ? (
          <span className="line-clamp-1">{r.goal}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "starts_on",
    label: "Starts",
    column: {
      id: "starts_on",
      accessorKey: "starts_on",
      header: "Starts",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (r) =>
        r.starts_on ? (
          new Date(`${r.starts_on}T00:00:00`).toLocaleDateString()
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "ends_on",
    label: "Ends",
    column: {
      id: "ends_on",
      accessorKey: "ends_on",
      header: "Ends",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (r) =>
        r.ends_on ? (
          new Date(`${r.ends_on}T00:00:00`).toLocaleDateString()
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "budget_amount",
    label: "Budget",
    column: {
      id: "budget_amount",
      accessorKey: "budget_amount",
      header: "Budget",
      filter: "select",
      filterOptions: [
        { value: "none", label: "No budget" },
        { value: "lt1k", label: "Under 1,000" },
        { value: "1k-10k", label: "1,000–10,000" },
        { value: "10k+", label: "10,000+" },
      ],
      cell: (r) =>
        r.budget_amount == null ? (
          <Muted>—</Muted>
        ) : (
          new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: r.budget_currency || "USD",
            maximumFractionDigits: 0,
          }).format(r.budget_amount)
        ),
    },
  },
  {
    id: "budget_currency",
    label: "Currency",
    facet: "currency",
    defaultHidden: true,
    column: {
      id: "budget_currency",
      accessorKey: "budget_currency",
      header: "Currency",
      filter: "select",
      cell: (r) => r.budget_currency ?? <Muted>—</Muted>,
    },
  },
  {
    id: "updated_at",
    label: "Updated",
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (r) => timeCell(r.updated_at),
    },
  },
  {
    id: "created_at",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      cell: (r) => timeCell(r.created_at),
    },
  },
];
