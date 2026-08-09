"use client";

// features/transcripts/browse/listConfig.tsx
//
// /transcripts expressed as an entity-list config — the SECOND consumer of the
// generic shell (lib/entity-list), and the hard test: five hub row shapes
// collapsed to one row type with a `kind` column, five source queries
// collapsed to the trx_* RPC set.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { relativeTime } from "@/lib/entity-list/columns";
import { TRANSCRIPT_COLUMNS } from "./columns";
import { TranscriptBrowseCards } from "./TranscriptBrowseCards";
import {
  fetchTranscriptFacets,
  fetchTranscriptListPage,
  fetchTranscriptScopeCounts,
  saveTranscriptRowEdit,
} from "./service";
import { useTranscriptRowActions } from "./useTranscriptRowActions";
import {
  KIND_META,
  TRANSCRIPT_LIST_SCOPES,
  type TranscriptListKind,
  type TranscriptListRow,
  type TranscriptRowEdit,
} from "./types";

export const transcriptListConfig: EntityListConfig<TranscriptListRow> = {
  surfaceKey: "transcripts-browse",
  entityLabel: { singular: "item", plural: "transcripts, sessions & cleanup" },
  scopes: TRANSCRIPT_LIST_SCOPES,
  service: {
    fetchPage: fetchTranscriptListPage,
    fetchCounts: fetchTranscriptScopeCounts,
    fetchFacets: fetchTranscriptFacets,
  },
  columns: TRANSCRIPT_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.title,
  useRowActions: useTranscriptRowActions,
  // No favorite / archived axes on the transcripts tables (yet).
  supportsArchived: false,
  edit: {
    save: (row, edit) => saveTranscriptRowEdit(row, edit as TranscriptRowEdit),
  },
  deepSearch: { label: "Also search inside transcript text" },
  facetSections: [
    {
      facet: "kind",
      filterId: "kind",
      label: "Type",
      noneLabel: "Unknown",
      countInLabel: false,
    },
    {
      facet: "status",
      filterId: "status",
      label: "Status",
      noneLabel: "No status",
      countInLabel: false,
    },
    {
      facet: "folder_name",
      filterId: "folder_name",
      label: "Folders",
      noneLabel: "No folder",
    },
    { facet: "tag", filterId: "tags", label: "Tags", noneLabel: "Untagged" },
    {
      facet: "visibility",
      filterId: "visibility",
      label: "Visibility",
      noneLabel: "None",
      minOptions: 2,
      countInLabel: false,
    },
  ],
  noneLabels: {
    status: "No status",
    folder_name: "No folder",
    tags: "Untagged",
    organization_name: "No organization",
    owner_email: "No owner",
  },
  copy: {
    label: "Transcript item",
    listLabel: "Transcripts",
    location: "/transcripts",
    rowKind: "transcript",
    listKind: "transcript-list",
    humanRow: (row) =>
      `${row.title} [${KIND_META[row.kind as TranscriptListKind]?.label ?? row.kind}] — updated ${relativeTime(row.updated_at)}`,
    showRow: false,
    showToolbar: false,
  },
  views: {
    cards: (p) => <TranscriptBrowseCards {...p} />,
  },
  emptyState: {
    title: "Nothing here yet",
    description:
      "Record audio, start a Studio session, or capture with Scribe to get started.",
  },
};
