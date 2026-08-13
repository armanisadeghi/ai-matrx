"use client";

import { useState } from "react";
import { Database, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableToolbar,
} from "@/components/official/matrx-data-table/types";
import type { ComponentEntry } from "../parts/component-list";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

type DemoRow = {
  id: string;
  name: string;
  status: "active" | "paused" | "archived";
  count: number;
  premium: boolean;
  owner: string;
};

const SEED: DemoRow[] = [
  {
    id: "1",
    name: "Alpha Registry",
    status: "active",
    count: 128,
    premium: true,
    owner: "platform",
  },
  {
    id: "2",
    name: "Beta Edges",
    status: "paused",
    count: 42,
    premium: false,
    owner: "ops",
  },
  {
    id: "3",
    name: "Gamma Closure",
    status: "active",
    count: 905,
    premium: true,
    owner: "platform",
  },
  {
    id: "4",
    name: "Delta Drift",
    status: "archived",
    count: 7,
    premium: false,
    owner: "audit",
  },
  {
    id: "5",
    name: "Epsilon Rules",
    status: "active",
    count: 56,
    premium: false,
    owner: "ops",
  },
];

const COLUMNS: MatrxColumnDef<DemoRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (r) => <span className="font-medium">{r.name}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    filter: "select",
    cell: (r) => (
      <Badge variant={r.status === "active" ? "default" : "secondary"}>
        {r.status}
      </Badge>
    ),
  },
  {
    accessorKey: "count",
    header: "Count",
    filter: "number",
    align: "right",
    cell: (r) => <span className="tabular-nums text-xs">{r.count}</span>,
  },
  {
    accessorKey: "premium",
    header: "Premium",
    filter: "boolean",
    cell: (r) => (r.premium ? "Yes" : "No"),
  },
  {
    accessorKey: "owner",
    header: "Owner",
    filter: "select",
  },
];

const LAYERED_FIELDS: NonNullable<
  MatrxDataTableToolbar["layeredFilters"]
>["fields"] = [
  { id: "name", label: "Name", kind: "text" },
  {
    id: "status",
    label: "Status",
    kind: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "paused", label: "Paused" },
      { value: "archived", label: "Archived" },
    ],
  },
  { id: "count", label: "Count", kind: "number" },
  { id: "owner", label: "Owner", kind: "text" },
];

export default function MatrxDataTableDisplay({
  component,
}: ComponentDisplayProps) {
  const [facet, setFacet] = useState("all");
  const [rows] = useState(SEED);

  const data = facet === "all" ? rows : rows.filter((r) => r.status === facet);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">
          {component?.name ?? "Matrx Data Table"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Sticky headers, every-column sort/filter, layered advanced rules,
          toolbar facets, row → SidePanelSurface, panel icon → WindowPanel.
        </p>
      </div>

      <div className="h-[32rem] rounded-lg border border-border bg-textured p-3">
        <MatrxDataTable
          urlState={{ id: "official-table-demo" }}
          data={data}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          pageSize={10}
          emptyState={{
            icon: <Database className="h-8 w-8 text-muted-foreground" />,
            title: "No demo rows",
            description: "Clear filters to see sample data.",
          }}
          toolbar={{
            searchPlaceholder: "Search demo rows…",
            layeredFilters: { fields: LAYERED_FIELDS },
            facets: [
              {
                type: "button-group",
                id: "status-facet",
                value: facet,
                options: [
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                  { value: "archived", label: "Archived" },
                ],
                onChange: setFacet,
              },
            ],
            actions: (
              <Button size="sm" className="h-7 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            ),
          }}
          detail={{
            title: (r) => r.name,
            description: (r) => `${r.owner} · ${r.status}`,
          }}
          window={{
            title: (r) => r.name,
          }}
        />
      </div>
    </div>
  );
}
