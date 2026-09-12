// features/content-ir/studio/records/related-records-service.ts
//
// THE RELATED LIST: the records that hang off ONE record (DD-131 slice 2,
// item 5).
//
// A parent record's children are `content_ir.kind_instance` rows of their own
// kind, tied to the parent by a `platform.associations` row:
//
//   source_type = 'content_ir_kind_instance'   source_id = the CHILD
//   target_type = 'content_ir_kind_instance'   target_id = the PARENT
//   label       = 'part_of'
//   position    = the child's 0-based index in the parent's array
//
// `position` IS THE ORDER. A keyword list that was third in the array is third
// here, always — never creation order, never heap order. The array the parent
// declared is the thing a person is reading, and reordering it silently would
// make the screen a different document from the record.
//
// NOTHING IN THIS FILE NAMES A KIND. Which children a parent has is answered
// by the `content_ir.kind_edge` graph (through the schema chokepoint
// `features/content-ir/registry/schema-source-kind-tables.ts`); which rows
// those children are is answered by the `part_of` edges. Both are generic, so
// every parent kind that declares children gets this list the day it declares
// them.
//
// The association read goes through the registered associations chokepoint
// (`features/scopes/service/associationsService`) — never a hand-rolled
// `assoc_*` call.

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import type { ArchiveFilterValue } from "@ai-matrx/design-system";
import type { Json } from "@/types/database.types";
import type {
  ConfirmationFilter,
  KindRecordRow,
  RecordConfirmation,
  RecordWriterTier,
} from "./types";

/** The entity token a kind instance is addressed by in `platform.associations`. */
export const KIND_INSTANCE_TOKEN = "content_ir_kind_instance";

/** The association label that ties a child record to the parent that owns it. */
export const PART_OF_LABEL = "part_of";

const ROW_COLUMNS =
  "id,title,data,confirmation,confirmed_at,confirmed_by,created_at,created_by,created_by_tier,created_by_system,organization_id,archived_at,kind_version,validation_status,metadata";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toConfirmation(raw: string): RecordConfirmation {
  return raw === "confirmed" ? "confirmed" : "unconfirmed";
}

function toWriterTier(raw: string | null): RecordWriterTier {
  return raw === "ai" || raw === "code" ? raw : "human";
}

function homeConversationId(metadata: Json | null): string | null {
  if (!isRecord(metadata)) return null;
  const home = metadata.home;
  if (!isRecord(home)) return null;
  const id = home.conversation_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** One child row, plus the position that fixes its place in the parent. */
export interface RelatedRecordRow extends KindRecordRow {
  /** The child's 0-based index in the parent's array. Null = never declared. */
  position: number | null;
}

export interface RelatedRecordsResult {
  /** The rows the current filters admit, in `position` order. */
  rows: RelatedRecordRow[];
  /** Counts for the archive control's three states, over this same parent. */
  archiveCounts: Partial<Record<ArchiveFilterValue, number>>;
  /** Counts for the confirmation facet, over this same parent. */
  confirmationCounts: Record<ConfirmationFilter, number>;
}

export interface ListRelatedChildRecordsArgs {
  /** The PARENT record's id. */
  parentId: string;
  /** The child kind's definition id — one tab reads one child kind. */
  childDefinitionId: string;
  confirmation: ConfirmationFilter;
  archiveFilter: ArchiveFilterValue;
}

/**
 * The children of one parent record, of one child kind, filtered and ordered.
 *
 * The filters are applied HERE, over the full child set, and the counts are
 * computed from that same set — so the archive control's numbers and the
 * confirmation facet describe exactly what each state would render. A control
 * whose number describes a different query is a lie.
 *
 * A read that fails THROWS with a sentence. An empty result is an empty
 * result; it is never how a failure looks.
 */
export async function listRelatedChildRecords(
  args: ListRelatedChildRecordsArgs,
): Promise<RelatedRecordsResult> {
  const edges = await associationsService.listForTargets(KIND_INSTANCE_TOKEN, [
    args.parentId,
  ]);
  if (!edges.ok) {
    throw new Error(
      `The records that belong to this one could not be read: ${edges.error.message}`,
    );
  }

  const positionById = new Map<string, number | null>();
  for (const edge of edges.data.edges) {
    if (edge.sourceType !== KIND_INSTANCE_TOKEN) continue;
    if (edge.label !== PART_OF_LABEL) continue;
    if (!edge.sourceId) continue;
    if (!positionById.has(edge.sourceId)) {
      positionById.set(edge.sourceId, edge.position);
    }
  }
  const childIds = [...positionById.keys()];
  if (childIds.length === 0) {
    return {
      rows: [],
      archiveCounts: { active: 0, archived: 0, all: 0 },
      confirmationCounts: { all: 0, unconfirmed: 0, confirmed: 0 },
    };
  }

  // One read of the whole child set. A parent's declared array is a bounded
  // list by construction (it is one record's field), so this is not a list
  // that needs paging — and reading it whole is what lets every count on the
  // screen describe the same set as the rows.
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .select(ROW_COLUMNS)
    .in("id", childIds)
    .eq("kind_definition_id", args.childDefinitionId)
    .is("deleted_at", null);
  if (error) {
    throw new Error(
      `The records that belong to this one could not be listed: ${error.message}`,
    );
  }

  const all: RelatedRecordRow[] = (data ?? [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      data: isRecord(row.data) ? row.data : {},
      confirmation: toConfirmation(row.confirmation),
      confirmedAt: row.confirmed_at,
      confirmedBy: row.confirmed_by,
      createdAt: row.created_at,
      createdBy: row.created_by,
      createdByTier: toWriterTier(row.created_by_tier),
      createdBySystem: row.created_by_system,
      organizationId: row.organization_id,
      archivedAt: row.archived_at,
      kindVersion: row.kind_version,
      validationStatus: row.validation_status,
      conversationId: homeConversationId(row.metadata),
      sourceMessageId: null,
      position: positionById.get(row.id) ?? null,
    }))
    // POSITION IS THE ORDER. A child whose edge never declared one sorts
    // after the declared ones rather than jumping to the front.
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) -
          (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const archiveCounts: Partial<Record<ArchiveFilterValue, number>> = {
    active: all.filter((r) => r.archivedAt === null).length,
    archived: all.filter((r) => r.archivedAt !== null).length,
    all: all.length,
  };

  const byArchive = all.filter((row) =>
    args.archiveFilter === "active"
      ? row.archivedAt === null
      : args.archiveFilter === "archived"
        ? row.archivedAt !== null
        : true,
  );

  const confirmationCounts: Record<ConfirmationFilter, number> = {
    all: byArchive.length,
    unconfirmed: byArchive.filter((r) => r.confirmation === "unconfirmed").length,
    confirmed: byArchive.filter((r) => r.confirmation === "confirmed").length,
  };

  const rows =
    args.confirmation === "all"
      ? byArchive
      : byArchive.filter((r) => r.confirmation === args.confirmation);

  return { rows, archiveCounts, confirmationCounts };
}
