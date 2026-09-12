// features/content-ir/studio/records/types.ts
//
// The vocabulary of the kind RECORDS table (/shapes/[kind]/table) — the
// org-wide register of one kind's saved `content_ir.kind_instance` rows.
//
// Two axes that look alike and are NOT (DD-131 slice 1):
//
//   CONFIRMATION — has a PERSON stood behind this row? `unconfirmed` means a
//     machine wrote it and nobody has vouched for it yet. It is written ONLY
//     by the database doors (`confirm_kind_instances` /
//     `unconfirm_kind_instances` / the confirming side-effect of
//     `edit_kind_instance_value`); the client never UPDATEs the column.
//   ARCHIVE — is this row still in the working set? A row may be
//     unconfirmed+archived, confirmed+archived, and every other combination.
//     All four are legal and all four render.
//
// Provenance (`created_by_tier`) is a THIRD, independent question: who typed
// it. NULL reads as a person — never backfilled, per
// `common-docs/systems/platform/provenance/FEATURE.md`.

import type { ArchiveFilterValue } from "@ai-matrx/design-system";
import type { ColumnFiltersState } from "@ai-matrx/design-system/data-table/types";

/** The stored `platform.confirmation` enum. */
export type RecordConfirmation = "unconfirmed" | "confirmed";

/** The actor tier that CREATED a row. NULL from the DB reads as `human`. */
export type RecordWriterTier = "ai" | "code" | "human";

/** One row of the records table. */
export interface KindRecordRow {
  id: string;
  title: string | null;
  /** The stored instance value (the `__kind` marker is PART of it). */
  data: Record<string, unknown>;
  confirmation: RecordConfirmation;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  createdBy: string | null;
  /** NULL from the DB is normalised to `human` — see the provenance SoR. */
  createdByTier: RecordWriterTier;
  createdBySystem: string | null;
  organizationId: string;
  archivedAt: string | null;
  kindVersion: number;
  validationStatus: string;
  /** `metadata.home.conversation_id` — the chat this record was born in. */
  conversationId: string | null;
  /**
   * The `chat.message` this record was produced by, reached through the
   * `produced_by` association edge. Null when no edge exists — which is the
   * truth for a record a person typed, not a missing read.
   */
  sourceMessageId: string | null;
}

/** The confirmation facet. `all` is the DEFAULT — unconfirmed rows always show. */
export type ConfirmationFilter = "all" | "unconfirmed" | "confirmed";

/** The provenance facet: who wrote it. `agent` = `created_by_tier in (ai, code)`. */
export type WriterFilter = "all" | "agent" | "person";

/** Every sortable column id the reader can serve. */
export type RecordSortKey =
  | "title"
  | "created_at"
  | "confirmation"
  | `data:${string}`;

export interface KindRecordsQuery {
  /** `mine` = rows I created; `orgs` = my organizations (blended or one). */
  scope: { kind: "mine" } | { kind: "orgs"; organizationId: string | null };
  search: string;
  confirmation: ConfirmationFilter;
  writer: WriterFilter;
  /** THE ARCHIVED-ITEMS LAW axis. Default `active`. */
  archiveFilter: ArchiveFilterValue;
  /** Per-column filters, served SERVER-side over the whole result set. */
  columnFilters: ColumnFiltersState;
  sort: RecordSortKey;
  direction: "asc" | "desc";
  /** ONE-BASED, like every other list surface in this repo (MatrxDataTable). */
  page: number;
  pageSize: number;
}

export interface KindRecordsPage {
  rows: KindRecordRow[];
  total: number;
}
