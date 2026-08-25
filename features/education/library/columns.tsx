"use client";

import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import {
  EDUCATION_LIBRARY_KIND_LABELS,
  EDUCATION_LIBRARY_SUBTYPE_LABELS,
  educationLibraryHref,
  libraryRowStats,
  type EducationLibraryKind,
  type EducationLibraryRow,
} from "./types";
import { artifactCount, artifactDuration } from "./artifactVisuals";
import { StudyProgressBar } from "./components/StudyProgressBar";

function label(value: string): string {
  return EDUCATION_LIBRARY_SUBTYPE_LABELS[value] ?? value.replaceAll("_", " ");
}

export const EDUCATION_LIBRARY_COLUMNS: EntityColumnSpec<EducationLibraryRow>[] =
  [
    {
      id: "title",
      label: "Title",
      locked: true,
      column: {
        id: "title",
        accessorKey: "title",
        header: "Title",
        filter: "text",
        href: educationLibraryHref,
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {row.title}
            </div>
            {row.description ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.description}
              </div>
            ) : null}
          </div>
        ),
      },
    },
    {
      id: "kind",
      label: "Type",
      locked: true,
      facet: "kind",
      formatFacetValue: (value) =>
        EDUCATION_LIBRARY_KIND_LABELS[value as EducationLibraryKind] ?? value,
      column: {
        id: "kind",
        accessorKey: "kind",
        header: "Type",
        filter: "select",
        cell: (row) => (
          <Badge variant="outline" className="py-0 text-[10px]">
            {EDUCATION_LIBRARY_KIND_LABELS[row.kind as EducationLibraryKind] ??
              row.kind}
          </Badge>
        ),
      },
    },
    {
      id: "subtype",
      label: "Format",
      facet: "subtype",
      formatFacetValue: label,
      column: {
        id: "subtype",
        accessorKey: "subtype",
        header: "Format",
        filter: "select",
        cell: (row) => (
          <span className="capitalize text-muted-foreground">
            {label(row.subtype)}
          </span>
        ),
      },
    },
    // ── Student-facing columns ────────────────────────────────────────────
    // These are the four questions a learner actually has about an artifact
    // ("how big, how far in, how well, what's waiting"). They arrive with the
    // row from `edu_library_list_scoped` — no per-row fetch — and are the same
    // numbers the card and row views render, so the three views can never
    // disagree about one deck.
    {
      id: "size",
      label: "Size",
      column: {
        id: "size",
        accessorKey: "item_count",
        header: "Size",
        cell: (row) => {
          const stats = libraryRowStats(row);
          const count = artifactCount(row.subtype, stats.itemCount);
          const duration = artifactDuration(stats.durationSeconds);
          const text = count ?? duration;
          return text ? (
            <span className="tabular-nums text-muted-foreground">{text}</span>
          ) : (
            <Muted>—</Muted>
          );
        },
      },
    },
    {
      id: "progress",
      label: "Progress",
      column: {
        id: "progress",
        accessorKey: "studied_count",
        header: "Progress",
        cell: (row) => {
          const stats = libraryRowStats(row);
          // "Not started" rather than an empty 0% bar: a fresh deck is not a
          // failing deck, and rendering it as one is how a study app teaches a
          // learner to avoid their own library.
          if (!stats.hasProgress) return <Muted>Not started</Muted>;
          return (
            <div className="w-28">
              <StudyProgressBar
                studied={stats.studiedCount}
                total={stats.itemCount}
                accuracy={stats.accuracy}
                className="mb-1"
              />
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {stats.itemCount
                  ? `${stats.studiedCount}/${stats.itemCount}`
                  : `${stats.studiedCount} studied`}
                {stats.accuracy != null &&
                  ` · ${Math.round(stats.accuracy * 100)}%`}
              </span>
            </div>
          );
        },
      },
    },
    {
      id: "due",
      label: "Due",
      column: {
        id: "due",
        accessorKey: "due_count",
        header: "Due",
        cell: (row) => {
          const { dueCount } = libraryRowStats(row);
          if (dueCount <= 0) return <Muted>—</Muted>;
          return (
            <Badge
              variant="outline"
              className="border-amber-500/40 py-0 text-[10px] font-semibold text-amber-700 tabular-nums dark:text-amber-400"
            >
              {dueCount}
            </Badge>
          );
        },
      },
    },
    {
      id: "last_studied",
      label: "Last studied",
      column: {
        id: "last_studied",
        accessorKey: "last_studied_at",
        header: "Last studied",
        cell: (row) => {
          const { lastStudiedAt } = libraryRowStats(row);
          return lastStudiedAt ? timeCell(lastStudiedAt) : <Muted>Never</Muted>;
        },
      },
    },
    {
      id: "source_title",
      label: "From",
      defaultHidden: true,
      column: {
        id: "source_title",
        accessorKey: "source_title",
        header: "From",
        filter: "text",
        cell: (row) => {
          const { sourceTitle, topic } = libraryRowStats(row);
          const text = sourceTitle ?? topic;
          return text ? (
            <span className="truncate text-muted-foreground">{text}</span>
          ) : (
            <Muted>—</Muted>
          );
        },
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
        cell: (row) => (
          <span className="capitalize text-muted-foreground">
            {row.status || "—"}
          </span>
        ),
      },
    },
    {
      id: "organization_name",
      label: "Organization",
      scopedToShared: true,
      column: {
        id: "organization_name",
        accessorKey: "organization_name",
        header: "Organization",
        filter: "text",
        cell: (row) =>
          row.organization_name ? (
            <span className="truncate text-muted-foreground">
              {row.organization_name}
            </span>
          ) : (
            <Muted>—</Muted>
          ),
      },
    },
    {
      id: "owner_email",
      label: "Owner",
      scopedToShared: true,
      column: {
        id: "owner_email",
        accessorKey: "owner_email",
        header: "Owner",
        filter: "text",
        cell: (row) => (
          <span className="truncate text-muted-foreground">
            {row.owner_email ?? "—"}
          </span>
        ),
      },
    },
    {
      id: "updated",
      label: "Updated",
      column: {
        id: "updated",
        accessorKey: "updated_at",
        header: "Updated",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        cell: (row) => timeCell(row.updated_at),
      },
    },
    {
      id: "created",
      label: "Created",
      defaultHidden: true,
      column: {
        id: "created",
        accessorKey: "created_at",
        header: "Created",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        cell: (row) => timeCell(row.created_at),
      },
    },
    {
      id: "visibility",
      label: "Visibility",
      defaultHidden: true,
      facet: "visibility",
      column: {
        id: "visibility",
        accessorKey: "visibility",
        header: "Visibility",
        filter: "select",
        cell: (row) => (
          <Badge variant="outline" className="py-0 text-[10px] capitalize">
            {row.visibility}
          </Badge>
        ),
      },
    },
  ];
