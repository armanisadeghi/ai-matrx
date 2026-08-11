/**
 * Canonical attachment projection.
 *
 * Pre-submit resources and persisted MessagePart values both become the same
 * ContextDrawerItem model. Every boundary is narrowed at runtime; this module
 * never recovers a guessed shape with `as string[]` or `as MessagePart`.
 */

import type { ManagedResource } from "@/features/agents/types/instance.types";
import type { DataRef } from "@/features/agents/types/message-types";
import type {
  MessagePart,
} from "@/types/python-generated/stream-events";
import {
  isPreFetchedUrl,
  readWebpageInputs,
  webpageTitle,
  webpageUrl,
} from "@/features/resource-manager/webpage/webpage-snapshot";
import { resolveContextItemDef } from "./registry";
import type {
  ContextBookmark,
  ContextDrawerItem,
  ContextEntityRef,
  ContextItemRefs,
} from "./types";

type Data = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

/** Accept plain ids, `{id}` references, or one raw picker record. */
function asResourceIdList(value: unknown): string[] | undefined {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string" && entry) {
      ids.push(entry);
    } else if (isRecord(entry) && typeof entry.id === "string" && entry.id) {
      ids.push(entry.id);
    }
  }
  return ids.length > 0 ? ids : undefined;
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? path : path.slice(index + 1);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return isRecord(value[key]) ? value[key] : null;
}

function extractMediaRefs(
  data: Data,
  raw: unknown,
): { fileId: string | null; fileUrl: string | null } {
  const d = data ?? {};
  const rawRecord = isRecord(raw) ? raw : null;
  const nestedData = readNestedRecord(raw, "data");

  const fileId =
    readNonEmptyString(d.fileId) ??
    readNonEmptyString(d.file_id) ??
    (rawRecord ? readNonEmptyString(rawRecord.file_id) : null) ??
    (nestedData ? readNonEmptyString(nestedData.fileId) : null) ??
    (nestedData ? readNonEmptyString(nestedData.file_id) : null);

  const fileUrl =
    readNonEmptyString(d.cdnUrl) ??
    readNonEmptyString(d.cdn_url) ??
    readNonEmptyString(d.signedUrl) ??
    readNonEmptyString(d.signed_url) ??
    readNonEmptyString(d.externalUrl) ??
    readNonEmptyString(d.external_url) ??
    readNonEmptyString(d.downloadUrl) ??
    readNonEmptyString(d.download_url) ??
    readNonEmptyString(d.url) ??
    (rawRecord ? readNonEmptyString(rawRecord.url) : null) ??
    (nestedData ? readNonEmptyString(nestedData.cdnUrl) : null) ??
    (nestedData ? readNonEmptyString(nestedData.signedUrl) : null) ??
    (nestedData ? readNonEmptyString(nestedData.externalUrl) : null) ??
    (nestedData ? readNonEmptyString(nestedData.url) : null);

  return { fileId, fileUrl };
}

function displayTitle(data: Data, fallback: string): string {
  const d = data ?? {};
  const metadata = isRecord(d.metadata) ? d.metadata : null;
  const candidate =
    readNonEmptyString(metadata?.display_title) ??
    readNonEmptyString(d.fileName) ??
    readNonEmptyString(d.file_name) ??
    readNonEmptyString(d.title) ??
    readNonEmptyString(d.label) ??
    readNonEmptyString(d.name) ??
    readNonEmptyString(d.filename) ??
    (typeof d.url === "string" ? basename(d.url) : null);
  return candidate?.slice(0, 100) || fallback;
}

function isDataRef(value: unknown): value is DataRef {
  if (!isRecord(value) || typeof value.table !== "string") return false;
  if (value.ref_type === "db_query") return true;
  if (value.ref_type === "db_record") return typeof value.id === "string";
  return (
    value.ref_type === "db_field" &&
    typeof value.id === "string" &&
    typeof value.field_name === "string"
  );
}

function readDataRefs(value: unknown): DataRef[] {
  return Array.isArray(value) ? value.filter(isDataRef) : [];
}

function isBookmark(value: unknown): value is ContextBookmark {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type.startsWith("table_")) return typeof value.table_id === "string";
  if (value.type === "full_table") return typeof value.table_id === "string";
  if (value.type.startsWith("list_")) return typeof value.list_id === "string";
  return value.type === "full_list" && typeof value.list_id === "string";
}

function readBookmarks(value: unknown): ContextBookmark[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  return entries.filter(isBookmark);
}

function bookmarkTitle(bookmark: ContextBookmark): string {
  if ("table_id" in bookmark) return bookmark.table_name?.trim() || "Table";
  return bookmark.list_name?.trim() || "List";
}

type ItemBase = Omit<ContextDrawerItem, "id" | "title" | "refs"> & {
  baseId: string;
};

function entityFieldFor(blockType: string): {
  field: string;
  token: string;
} | null {
  switch (blockType) {
    case "input_agent":
      return { field: "agent_ids", token: "agent" };
    case "input_project":
      return { field: "project_ids", token: "project" };
    case "input_agent_app":
      return { field: "agent_app_ids", token: "app" };
    case "input_transcript":
      return { field: "transcript_ids", token: "transcript" };
    case "input_transcript_session":
      return { field: "transcript_session_ids", token: "studio_session" };
    case "input_workbook":
      return { field: "workbook_ids", token: "workbook" };
    case "input_document":
      return { field: "document_ids", token: "udt_document" };
    default:
      return null;
  }
}

function expand(
  blockType: string,
  data: Data,
  base: ItemBase,
): ContextDrawerItem[] {
  const d = data ?? {};
  const make = (
    idSuffix: string,
    title: string,
    refs: ContextItemRefs,
    raw: unknown = base.raw,
  ): ContextDrawerItem => {
    const { baseId, ...rest } = base;
    return { ...rest, id: `${baseId}:${idSuffix}`, title, refs, raw };
  };

  if (blockType === "input_notes") {
    const ids = asResourceIdList(d.note_ids ?? d);
    return (ids ?? []).map((id) => make(id, displayTitle(d, "Note"), { noteIds: [id] }));
  }

  if (blockType === "input_task") {
    const ids = asResourceIdList(d.task_ids ?? d);
    return (ids ?? []).map((id) => make(id, displayTitle(d, "Task"), { taskIds: [id] }));
  }

  if (blockType === "input_webpage") {
    const webpages = readWebpageInputs(
      isPreFetchedUrl(d) ? d : d.urls ?? d.url ?? d,
    );
    return webpages.map((webpage, index) =>
      make(
        `${index}-${webpageUrl(webpage)}`,
        webpageTitle(webpage),
        { webpages: [webpage] },
        webpage,
      ),
    );
  }

  if (blockType === "input_data") {
    const refs = readDataRefs(d.refs);
    return refs.map((ref, index) =>
      make(String(index), ref.label?.trim() || ref.table, { dataRefs: [ref] }, ref),
    );
  }

  if (blockType === "input_context") {
    const contextData = isRecord(d.context_data) ? d.context_data : {};
    const contextId = readNonEmptyString(d.context_id);
    const contextName = readNonEmptyString(d.context_name);
    return [
      make(contextId ?? "context", contextName ?? "Context", {
        contextInput: {
          id: contextId,
          name: contextName,
          data: contextData,
        },
      }),
    ];
  }

  if (blockType === "input_table" || blockType === "input_list") {
    const bookmarks = readBookmarks(d.bookmarks ?? d);
    return bookmarks.map((bookmark, index) =>
      make(String(index), bookmarkTitle(bookmark), { bookmarks: [bookmark] }, bookmark),
    );
  }

  const entityField = entityFieldFor(blockType);
  if (entityField) {
    const ids = asResourceIdList(d[entityField.field] ?? d);
    const label = displayTitle(d, base.typeLabel);
    return (ids ?? []).map((id) => {
      const entityRef: ContextEntityRef = {
        token: entityField.token,
        id,
        name: label === base.typeLabel ? null : label,
      };
      return make(id, entityRef.name ?? base.typeLabel, { entityRefs: [entityRef] });
    });
  }

  const { fileId, fileUrl } = extractMediaRefs(d, base.raw);
  if (fileId || fileUrl) {
    return [make("media", displayTitle(d, base.typeLabel), { fileId, fileUrl })];
  }

  const text = readNonEmptyString(d.text) ?? readNonEmptyString(d.content);
  return [make("0", displayTitle(d, base.typeLabel), { text })];
}

/** Normalize a pre-submit ManagedResource. It remains editable only before send. */
export function normalizeResource(
  resource: ManagedResource,
  conversationId: string,
): ContextDrawerItem[] {
  const def = resolveContextItemDef(resource.blockType);
  const source = isRecord(resource.source)
    ? resource.source
    : typeof resource.source === "string" &&
        (resource.blockType === "input_webpage" ||
          resource.blockType === "image" ||
          resource.blockType === "audio" ||
          resource.blockType === "video" ||
          resource.blockType === "document" ||
          resource.blockType === "youtube_video")
      ? { url: resource.source }
      : { text: resource.source };
  return expand(resource.blockType, source, {
    baseId: resource.resourceId,
    blockType: resource.blockType,
    typeLabel: def.typeLabel,
    icon: def.icon,
    themeKey: def.themeKey,
    origin: "resource",
    conversationId,
    editable: def.editable,
    raw: resource.source,
    resourceId: resource.resourceId,
  });
}

const NON_ATTACHMENT_PART_TYPES = new Set([
  "text",
  "thinking",
  "tool_call",
  "tool_result",
  "code_exec",
  "code_result",
  "web_search",
]);

export function isAttachmentMessagePart(part: MessagePart): boolean {
  return !!part.type && !NON_ATTACHMENT_PART_TYPES.has(part.type);
}

/** Normalize one persisted part without erasing its generated field types. */
export function normalizeMessagePart(
  part: MessagePart,
  index: number,
  conversationId: string,
): ContextDrawerItem[] {
  if (!isAttachmentMessagePart(part)) return [];
  const partType = part.type;
  if (!partType) return [];

  const blockType =
    partType === "media"
      ? part.kind === "youtube"
        ? "youtube_video"
        : part.kind ?? "media"
      : partType;
  const def = resolveContextItemDef(blockType);
  return expand(blockType, isRecord(part) ? part : null, {
    baseId: `part-${index}`,
    blockType,
    typeLabel: def.typeLabel,
    icon: def.icon,
    themeKey: def.themeKey,
    origin: "block",
    conversationId,
    editable: false,
    raw: part,
  });
}
