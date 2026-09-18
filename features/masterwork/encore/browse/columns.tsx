"use client";

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  TextCell,
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
        <TextCell value={row.name} className="font-medium text-foreground" />
      ),
    },
  },
  {
    id: "status",
    label: "Status",
    column: {
      id: "status",
      accessorFn: (row) => (row.released_at === null ? "Draft" : "Released"),
      header: "Status",
      filter: false,
      // A DRAFT SAYS SO — see EncoreBrowseCards for the rule.
      cell: (row) =>
        row.released_at === null ? (
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            Draft
          </Badge>
        ) : (
          <Badge className="px-1.5 py-0 text-[10px]">Released</Badge>
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
      cell: (row) => <TextCell value={row.rulebook?.expert} />,
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
    // A QUICK CHECK, never "Expert match" and never proof: the Audition is two
    // arms against one reference (CORE.md §6). The proof is a Bench run, shown
    // on the run page beside this number.
    label: "Quick check",
    column: {
      id: "audition_score",
      accessorKey: "auditionScore",
      header: "Quick check",
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
