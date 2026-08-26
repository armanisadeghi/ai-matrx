"use client";

// features/agents/mandates/browse/columns.tsx
//
// The MANDATES column registry for the canonical entity list. Every column
// sorts AND filters server-side (app policy); the sort ids match
// mnd_list_scoped's v_sort vocabulary exactly, and select columns are fed by
// the facet payload so chips and header filters can never drift.

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";
import {
  HEALTH_META,
  LAYER_META,
  mandateRoute,
  type MandateListRow,
} from "./types";

const LAYER_FILTER_OPTIONS = [
  { value: "user", label: "Yours" },
  { value: "org", label: "Organization" },
  { value: "system", label: "System" },
];

const HEALTH_FILTER_OPTIONS = [
  { value: "ok", label: "OK" },
  { value: "drift", label: "Drift (pinned behind)" },
  { value: "holder archived", label: "Holder archived" },
  { value: "holder missing", label: "Holder missing" },
  { value: "disabled", label: "Disabled" },
];

export const MANDATE_COLUMNS: EntityColumnSpec<MandateListRow>[] = [
  {
    id: "label",
    label: "Job",
    locked: true,
    column: {
      id: "label",
      accessorKey: "label",
      header: "Job",
      filter: "text",
      // THE DOOR LAW via the shell: the name is a real anchor onto the
      // dedicated route (cmd-click, middle-click, keyboard). Row CLICK opens
      // the window panel instead — both hosts wrap the same workspace.
      href: mandateRoute,
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.label}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground/80">
            {row.mandate_key}
          </div>
        </div>
      ),
    },
  },
  {
    id: "feature",
    label: "Feature",
    locked: true,
    facet: "feature",
    column: {
      id: "feature",
      accessorKey: "feature",
      header: "Feature",
      filter: "select",
      width: 130,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10.5px] font-medium">
          {row.feature.replace(/_/g, " ")}
        </Badge>
      ),
    },
  },
  {
    id: "fulfilled_by",
    label: "Fulfilled by",
    column: {
      id: "fulfilled_by",
      accessorFn: (row) => row.resolved_agent_name ?? "",
      header: "Fulfilled by",
      filter: "text",
      // The effective Holder — an agent identity — plus who decided it. The
      // full doors (open / peek / window) live on the workspace; the list cell
      // stays light so 25 rows don't mount 25 EntityRefs.
      cell: (row) => {
        const layer = LAYER_META[row.resolved_layer];
        return (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">
              {row.resolved_agent_name ?? <Muted>—</Muted>}
            </span>
            <Badge
              variant="outline"
              className={cn("shrink-0 py-0 text-[10px]", layer.className)}
            >
              {layer.label}
            </Badge>
            {row.drift ? (
              <Badge
                variant="outline"
                className={cn("shrink-0 py-0 font-mono text-[10px]", HEALTH_META.drift.className)}
              >
                {row.drift}
              </Badge>
            ) : null}
          </div>
        );
      },
    },
  },
  {
    id: "layer",
    label: "Decided by",
    defaultHidden: true,
    facet: "layer",
    column: {
      id: "layer",
      accessorKey: "resolved_layer",
      header: "Decided by",
      filter: "select",
      filterOptions: LAYER_FILTER_OPTIONS,
      width: 110,
      cell: (row) => {
        const layer = LAYER_META[row.resolved_layer];
        return (
          <Badge variant="outline" className={cn("py-0 text-[10px]", layer.className)}>
            {layer.label}
          </Badge>
        );
      },
    },
  },
  {
    id: "inputs",
    label: "Inputs",
    column: {
      id: "inputs",
      accessorKey: "offered_count",
      header: "Inputs",
      filter: "boolean",
      filterOptions: [
        { value: "true", label: "Has a Provision" },
        { value: "false", label: "Legacy contract" },
      ],
      width: 120,
      cell: (row) =>
        row.provision_key ? (
          <span className="text-[12px] text-muted-foreground">
            {row.offered_count} offered
          </span>
        ) : (
          <Muted>legacy</Muted>
        ),
    },
  },
  {
    id: "output_kind",
    label: "Output",
    facet: "output_kind",
    column: {
      id: "output_kind",
      accessorKey: "output_kind",
      header: "Output",
      filter: "select",
      width: 150,
      cell: (row) =>
        row.output_kind ? (
          <Badge variant="outline" className="max-w-full truncate py-0 font-mono text-[10.5px]">
            {row.output_kind}
          </Badge>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "health",
    label: "Status",
    facet: "health",
    column: {
      id: "health",
      accessorKey: "health",
      header: "Status",
      filter: "select",
      filterOptions: HEALTH_FILTER_OPTIONS,
      width: 130,
      cell: (row) => {
        const meta = HEALTH_META[row.health];
        return (
          <Badge variant="outline" className={cn("py-0 text-[10px]", meta.className)}>
            {row.health === "drift" && row.drift ? row.drift : meta.label}
          </Badge>
        );
      },
    },
  },
  {
    id: "updated",
    label: "Updated",
    column: {
      id: "updated",
      accessorFn: (row) => row.updated_at,
      header: "Updated",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      filterSingle: true,
      width: 120,
      cell: (row) => timeCell(row.updated_at),
    },
  },
];
