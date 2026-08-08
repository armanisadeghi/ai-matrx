"use client";

// features/transcripts/browse/columns.tsx
//
// The TRANSCRIPTS column registry for the canonical entity list. Every column
// sorts AND filters server-side (app policy) — numeric columns filter by
// bucket (trx_duration_matches / trx_words_matches in SQL), dates by relative
// bucket, finite sets by facet options with counts.

import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  KIND_META,
  type TranscriptListKind,
  type TranscriptListRow,
} from "./types";

const DURATION_FILTER_OPTIONS = [
  { value: "lt1m", label: "Under a minute" },
  { value: "1-5m", label: "1–5 minutes" },
  { value: "5-20m", label: "5–20 minutes" },
  { value: "gt20m", label: "Over 20 minutes" },
  { value: "__none__", label: "No duration" },
];

const WORDS_FILTER_OPTIONS = [
  { value: "lt500", label: "Under 500 words" },
  { value: "500-2k", label: "500–2,000" },
  { value: "2k-10k", label: "2,000–10,000" },
  { value: "gt10k", label: "Over 10,000" },
  { value: "__none__", label: "No word count" },
];

export const TRANSCRIPT_COLUMNS: EntityColumnSpec<TranscriptListRow>[] = [
  {
    id: "title",
    label: "Title",
    locked: true,
    column: {
      id: "title",
      accessorKey: "title",
      header: "Title",
      filter: "text",
      editable: "string",
      editTrigger: "pencil",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.title}</span>
          {row.is_draft && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              Draft
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "kind",
    label: "Type",
    locked: true,
    facet: "kind",
    column: {
      id: "kind",
      accessorKey: "kind",
      header: "Type",
      filter: "select",
      width: 110,
      cell: (row) => {
        const meta = KIND_META[row.kind as TranscriptListKind];
        return (
          <Badge
            variant="outline"
            className={cn(
              "py-0 text-[10px] font-medium uppercase tracking-wide",
              meta?.accent,
            )}
          >
            {meta?.label ?? row.kind}
          </Badge>
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
      width: 100,
      cell: (row) =>
        row.status ? (
          <span className="text-xs capitalize text-muted-foreground">
            {row.status}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "folder_name",
    label: "Folder",
    facet: "folder_name",
    column: {
      id: "folder_name",
      accessorKey: "folder_name",
      header: "Folder",
      filter: "select",
      width: 140,
      cell: (row) =>
        row.folder_name ? (
          <span className="truncate text-muted-foreground">
            {row.folder_name}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "tags",
    label: "Tags",
    facet: "tag",
    column: {
      id: "tags",
      accessorKey: "tags",
      header: "Tags",
      filter: "select",
      width: 180,
      cell: (row) =>
        row.tags?.length ? (
          <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
            {row.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="max-w-[84px] shrink-0 truncate py-0 text-[10px] font-normal"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
            {row.tags.length > 2 && (
              <span
                className="shrink-0 text-[10px] text-muted-foreground"
                title={row.tags.join(", ")}
              >
                +{row.tags.length - 2}
              </span>
            )}
          </div>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "duration",
    label: "Duration",
    column: {
      id: "duration",
      accessorKey: "duration_seconds",
      header: "Duration",
      filter: "select",
      filterOptions: DURATION_FILTER_OPTIONS,
      width: 100,
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDuration(row.duration_seconds)}
        </span>
      ),
    },
  },
  {
    id: "word_count",
    label: "Words",
    defaultHidden: true,
    column: {
      id: "word_count",
      accessorKey: "word_count",
      header: "Words",
      filter: "select",
      filterOptions: WORDS_FILTER_OPTIONS,
      width: 90,
      align: "right",
      cell: (row) =>
        row.word_count != null ? (
          <span className="tabular-nums text-muted-foreground">
            {row.word_count.toLocaleString()}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    facet: "organization_name",
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      width: 170,
      cell: (row) =>
        row.organization_name ? (
          <span className="flex items-center gap-1.5 truncate text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
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
    facet: "owner_email",
    column: {
      id: "owner_email",
      accessorKey: "owner_email",
      header: "Owner",
      filter: "text",
      width: 190,
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
      width: 120,
      align: "right",
      cell: (row) => timeCell(row.updated_at),
    },
  },
  // ── Off by default. Present, one click away, never a code change. ────────
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
      width: 120,
      align: "right",
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
      width: 120,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.visibility}
        </Badge>
      ),
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
      width: 280,
      className: "max-w-[18rem] overflow-hidden",
      cell: (row) =>
        row.description ? (
          <span
            className="block truncate text-muted-foreground"
            title={row.description}
          >
            {row.description}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
];
