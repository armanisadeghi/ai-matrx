"use client";

// features/transcripts/browse/listConfig.tsx
//
// /transcripts expressed as an entity-list config — the SECOND consumer of the
// generic shell (lib/entity-list), and the hard test: five hub row shapes
// collapsed to one row type with a `kind` column, five source queries
// collapsed to the trx_* RPC set.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { keyFieldsAiVariant } from "@/features/marketing/lib/copy-payloads";
import { transcriptRowSummary } from "@/features/transcripts/format";
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
  primaryRowHref,
  TRANSCRIPT_LIST_SCOPES,
  type TranscriptListKind,
  type TranscriptListRow,
  type TranscriptRowEdit,
} from "./types";

export const transcriptListConfig: EntityListConfig<TranscriptListRow> = {
  surfaceKey: "transcripts-browse",
  entityLabel: { singular: "item", plural: "transcripts, sessions & cleanup" },
  sourceFeature: "transcription",
  /**
   * HETEROGENEOUS HUB — one entity per kind, each verified against the live
   * `trx_list_scoped` definition rather than assumed. An earlier revision
   * claimed only `transcript` was a registered entity and gave the other three
   * nothing; that was simply wrong, and it cost three of four kinds their
   * Attach To. The RPC's UNION is the source of truth:
   *   transcript        -> transcripts.transcripts.id
   *   session | cleanup -> transcripts.studio_sessions.id      (`studio_session`)
   *   unsorted          -> transcripts.studio_recording_segments.id
   *
   * `resourceType` follows the SAME RPC, which is the subtle half. Its
   * permissions join reads `resource_type = 'studio_session'` for every
   * non-transcript kind, and for `unsorted` it keys on the row's
   * `session_id` — an unsorted segment is shared THROUGH ITS PARENT SESSION
   * and is not a shareable resource in its own right (no registry entry, and
   * `referencePickable: false`). So the segment gets Attach To and no Share:
   * offering Share there would target a permission row that cannot exist.
   *
   * Share is a real gain on the other three — `useTranscriptRowActions` has no
   * share action of its own, so v3's is the only one (checklist 14).
   */
  getRowEntity: (row) => {
    if (row.kind === "transcript")
      return {
        type: "transcript",
        id: row.id,
        title: row.title,
        resourceType: "transcript",
        isOwner: row.is_owner,
      };
    if (row.kind === "session" || row.kind === "cleanup")
      return {
        type: "studio_session",
        id: row.id,
        title: row.title,
        resourceType: "studio_session",
        isOwner: row.is_owner,
      };
    return {
      type: "studio_recording_segments",
      id: row.id,
      title: row.title,
    };
  },
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
  // THE DOOR LAW: the Title cell is a real anchor. Heterogeneous rows route
  // per kind, so the door reuses the SAME `primaryRowHref` the row click and
  // the "…" menu use — one destination, three ways to reach it.
  door: { hrefFor: primaryRowHref },
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
  /**
   * Copy / Copy-for-AI for the hub.
   *
   * This block existed but had `showRow` and `showToolbar` BOTH false, which
   * meant MatrxDataTable rendered no copy control anywhere — the config was
   * dead and the hub shipped with no way to get a row out. Both are on now,
   * which also brings the toolbar's ExportMenu (JSON + CSV of the current
   * view) for free.
   *
   * `rowKind` is `transcript-hub-item`, NOT `transcript`: this hub is
   * heterogeneous (transcript | session | cleanup | unsorted) and its rows
   * carry metadata only — no segments. The viewer's record payload uses
   * `transcript` and DOES carry segments, so letting a metadata row claim the
   * same slug would tell a future agent the two are interchangeable. The real
   * per-row kind travels in `rowAttributes.kind`.
   */
  copy: {
    label: "Transcript item",
    listLabel: "Transcripts",
    location: "/transcripts",
    rowKind: "transcript-hub-item",
    listKind: "transcript-hub-list",
    rowDescription:
      "One row of the transcripts hub — a transcript, studio session, cleanup session or unsorted recording. Metadata only; no transcript body.",
    listDescription:
      "The transcripts hub as currently filtered and sorted. Metadata only; no transcript bodies.",
    humanRow: (row) =>
      transcriptRowSummary({
        kind: KIND_META[row.kind as TranscriptListKind]?.label ?? row.kind,
        title: row.title,
        updated_at: row.updated_at,
        duration_seconds: row.duration_seconds,
        word_count: row.word_count,
        scope: row.organization_name,
        id: row.id,
      }),
    agentRow: (row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      status: row.status,
      folder_name: row.folder_name,
      tags: row.tags,
      duration_seconds: row.duration_seconds,
      word_count: row.word_count,
      is_draft: row.is_draft,
      visibility: row.visibility,
      organization_name: row.organization_name,
      owner_email: row.owner_email,
      access_level: row.access_level,
      updated_at: row.updated_at,
      created_at: row.created_at,
      href: primaryRowHref(row),
      body_included: false,
    }),
    rowAttributes: (row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      words: row.word_count,
      draft: row.is_draft,
    }),
    listAttributes: (visible, all) => ({
      rows: visible.length,
      rows_loaded: all.length,
      // trx_list_scoped carries the true server-side total on every row, so a
      // paged view states what it is a slice OF instead of implying the loaded
      // page is everything.
      rows_total: all[0]?.total_count ?? visible.length,
    }),
    aiVariants: (visible, all) => [
      keyFieldsAiVariant({
        kind: "transcript-hub-list",
        location: "/transcripts",
        description:
          "Hub rows projected to kind / title / duration / words / updated.",
        visible,
        project: (row) => ({
          kind: row.kind,
          title: row.title,
          duration_seconds: row.duration_seconds,
          word_count: row.word_count,
          updated_at: row.updated_at,
        }),
        attributes: {
          rows: visible.length,
          rows_total: all[0]?.total_count ?? visible.length,
        },
      }),
    ],
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
