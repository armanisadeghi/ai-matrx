"use client";

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import type { EncoreListRow } from "./types";

export const ENCORE_COLUMNS: EntityColumnSpec<EncoreListRow>[] = [
  {
    id: "name",
    label: "Name",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      cell: (row) => (
        <span className="truncate font-medium text-foreground">{row.name}</span>
      ),
    },
  },
  {
    id: "expert",
    label: "Expert",
    column: {
      id: "expert",
      accessorFn: (row) => row.rulebook?.expert ?? "",
      header: "Expert",
      filter: "text",
      cell: (row) =>
        row.rulebook ? <span>{row.rulebook.expert}</span> : <Muted>—</Muted>,
    },
  },
  {
    id: "rule_count",
    label: "Rules",
    column: {
      id: "rule_count",
      accessorKey: "rule_count",
      header: "Rules",
      filter: false,
      cell: (row) =>
        row.rule_count !== null ? (
          <span className="tabular-nums">{row.rule_count}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "audition_score",
    label: "Expert match",
    column: {
      id: "audition_score",
      accessorKey: "auditionScore",
      header: "Expert match",
      filter: false,
      cell: (row) =>
        row.auditionScore !== null ? (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {Math.round(row.auditionScore)}/100
          </Badge>
        ) : (
          <Muted>—</Muted>
        ),
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
      cell: (row) => timeCell(row.updated_at),
    },
  },
];
