"use client";

// features/research/browse/columns.tsx
//
// The topic list's columns. The name cell carries the research question under
// it (the description IS the question a topic answers), so a person scanning
// the list reads what each topic is for without opening it — the old card grid
// cut both to two lines in a quarter-width card.
//
// SORTING IS HONEST: every column sorts and filters on the server
// (`public.rsx_list_scoped` whitelists exactly these ids).

import { FolderKanban } from "lucide-react";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  TextCell,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { StatusBadge } from "../components/shared/StatusBadge";
import { organizationLabel, projectLabel } from "./service";
import {
  AUTONOMY_LABELS,
  TOPIC_STATUS_LABELS,
  labelFor,
  type ResearchTopicListRow,
} from "./types";

export const formatTopicStatus = (value: string) =>
  labelFor(TOPIC_STATUS_LABELS, value);
export const formatAutonomy = (value: string) => labelFor(AUTONOMY_LABELS, value);

export const RESEARCH_TOPIC_COLUMNS: EntityColumnSpec<ResearchTopicListRow>[] = [
  {
    id: "name",
    label: "Topic",
    locked: true,
    phone: "title",
    column: {
      id: "name",
      accessorKey: "name",
      header: "Topic",
      filter: "text",
      width: 420,
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <TextCell value={row.name} className="font-medium" />
          {row.description?.trim() ? (
            <span
              className="line-clamp-2 whitespace-normal break-words text-xs text-muted-foreground"
              title={row.description}
            >
              {row.description}
            </span>
          ) : null}
        </div>
      ),
    },
  },
  {
    id: "status",
    label: "Status",
    facet: "status",
    phone: "primary",
    formatFacetValue: formatTopicStatus,
    column: {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      width: 130,
      cell: (row) => <StatusBadge status={row.status} className="text-xs" />,
    },
  },
  {
    id: "project",
    label: "Project",
    facet: "project",
    phone: "meta",
    formatFacetValue: projectLabel,
    column: {
      id: "project",
      accessorFn: (row) => row.project_name ?? "",
      header: "Project",
      filter: "select",
      width: 200,
      cell: (row) =>
        row.project_name ? (
          // `max-w-full min-w-0` — an unbounded inline-flex wrapper sized to
          // its text and printed long project names over the Updated column;
          // `w-full` instead squeezed the phone card's "Project" label onto
          // two lines (both live looks, 2026-09-27).
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <FolderKanban className="h-3.5 w-3.5 shrink-0" />
            <TextCell value={row.project_name} className="min-w-0" />
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    facet: "organization_name",
    scopedToShared: true,
    phone: "rest",
    formatFacetValue: organizationLabel,
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "select",
      width: 180,
      cell: (row) => <TextCell value={row.organization_name} className="text-xs" muted />,
    },
  },
  {
    id: "autonomy_level",
    label: "Autonomy",
    defaultHidden: true,
    facet: "autonomy_level",
    formatFacetValue: formatAutonomy,
    phone: "rest",
    column: {
      id: "autonomy_level",
      accessorKey: "autonomy_level",
      header: "Autonomy",
      filter: "select",
      width: 150,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatAutonomy(row.autonomy_level)}
        </span>
      ),
    },
  },
  {
    id: "updated_at",
    label: "Updated",
    phone: "meta",
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 120,
      cell: (row) => <span className="text-xs">{timeCell(row.updated_at)}</span>,
    },
  },
  {
    id: "created_at",
    label: "Created",
    defaultHidden: true,
    phone: "rest",
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 120,
      cell: (row) => <span className="text-xs">{timeCell(row.created_at)}</span>,
    },
  },
];
