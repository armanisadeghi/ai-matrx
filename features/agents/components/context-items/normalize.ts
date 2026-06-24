/**
 * Normalization — turn the two attachment representations (pre-submit
 * `ManagedResource` and post-submit `RenderBlockPayload`) into a flat list of
 * `ContextDrawerItem`s, ONE per underlying record. Flattening here means the
 * drawer's prev/next walks every individual note / task / url / ref, not just
 * every chip.
 */

import type { ManagedResource } from "@/features/agents/types/instance.types";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import type { DataRef } from "@/features/agents/types/message-types";
import { resolveContextItemDef } from "./registry";
import type { ContextDrawerItem, ContextItemRefs } from "./types";

type Data = Record<string, unknown> | null | undefined;

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length ? out : undefined;
}

/** Accept plain id strings or `{ id }` ResourceRefInput objects from the wire. */
function asResourceIdList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const ids: string[] = [];
  for (const entry of v) {
    if (typeof entry === "string" && entry) {
      ids.push(entry);
    } else if (entry && typeof entry === "object") {
      const id = (entry as Record<string, unknown>).id;
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  return ids.length ? ids : undefined;
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i === -1 ? path : path.slice(i + 1);
}

function readNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readNestedRecord(
  obj: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const nested = (obj as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

/**
 * Lift `fileId` + a renderable URL off every media shape we store:
 * pre-submit MediaRef (`file_id` / `url`), wire blocks, and post-submit
 * `image_output.data` (UnifiedImageBlock camelCase).
 */
function extractMediaRefs(
  data: Data,
  raw: unknown,
): { fileId: string | null; fileUrl: string | null } {
  const d = data ?? {};
  const rawRecord =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const nestedData = readNestedRecord(raw, "data");

  const fileId =
    readNonEmptyString(d.fileId) ??
    readNonEmptyString(d.file_id) ??
    (rawRecord ? readNonEmptyString(rawRecord.file_id) : null) ??
    (nestedData ? readNonEmptyString(nestedData.fileId) : null) ??
    (nestedData ? readNonEmptyString(nestedData.file_id) : null) ??
    null;

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
    (nestedData ? readNonEmptyString(nestedData.url) : null) ??
    null;

  return { fileId, fileUrl };
}

function bestTitle(data: Data, fallback: string): string {
  const d = data ?? {};
  const candidate =
    (d.fileName as string) ??
    (d.file_name as string) ??
    (d.title as string) ??
    (d.label as string) ??
    (d.name as string) ??
    (d.filename as string) ??
    (typeof d.url === "string" ? basename(d.url as string) : undefined);
  return candidate?.toString().slice(0, 80) || fallback;
}

/**
 * Build the per-record items for a single attachment given its block type, the
 * data bag (block.data or resource.source), and shared meta. Splits multi-id
 * bags into one item each.
 */
/** The shared, per-attachment fields (everything but the per-record id/title/refs). */
type ItemBase = Omit<ContextDrawerItem, "id" | "title" | "refs"> & {
  /** The attachment-level base id; per-record ids are derived from it. */
  baseId: string;
};

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
  ): ContextDrawerItem => {
    const { baseId, ...rest } = base;
    return {
      ...rest,
      id: `${baseId}:${idSuffix}`,
      title,
      refs,
    };
  };

  // Notes
  const noteIds = asResourceIdList(d.note_ids);
  if (noteIds) return noteIds.map((id) => make(id, "Note", { noteIds: [id] }));

  // Tasks
  const taskIds = asResourceIdList(d.task_ids);
  if (taskIds) return taskIds.map((id) => make(id, "Task", { taskIds: [id] }));

  // Webpages
  const urls =
    asStringArray(d.urls) ??
    (typeof d.url === "string" ? [d.url as string] : undefined);
  if (urls) return urls.map((u) => make(u, u, { urls: [u] }));

  // Data refs
  const refs = Array.isArray(d.refs) ? (d.refs as DataRef[]) : undefined;
  if (refs && refs.length) {
    return refs.map((r, i) =>
      make(String(i), r.label?.trim() || r.table, { dataRefs: [r] }),
    );
  }

  // Media — file_id / url (UnifiedImageBlock, MediaRef, wire blocks)
  const { fileId, fileUrl } = extractMediaRefs(d, base.raw);
  if (fileId || fileUrl) {
    return [make("media", bestTitle(d, base.typeLabel), { fileId, fileUrl })];
  }

  // Entity id lists → GenericBody
  const entityRefs: ContextItemRefs = {
    projectIds: asStringArray(d.project_ids),
    agentIds: asStringArray(d.agent_ids),
    transcriptIds:
      asStringArray(d.transcript_ids) ?? asStringArray(d.session_ids),
    workbookIds: asStringArray(d.workbook_ids),
    documentIds: asStringArray(d.document_ids),
    text:
      typeof d.text === "string"
        ? (d.text as string)
        : typeof d.content === "string"
          ? (d.content as string)
          : null,
  };

  return [make("0", bestTitle(d, base.typeLabel), entityRefs)];
}

/** Normalize a pre-submit ManagedResource into drawer items. */
export function normalizeResource(
  resource: ManagedResource,
  conversationId: string,
): ContextDrawerItem[] {
  const def = resolveContextItemDef(resource.blockType);
  return expand(resource.blockType, resource.source as Data, {
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

/** Normalize a post-submit RenderBlockPayload into drawer items. */
export function normalizeBlock(
  block: RenderBlockPayload,
  idx: number,
  conversationId: string,
): ContextDrawerItem[] {
  if (block.type === "text") return [];
  const def = resolveContextItemDef(block.type);
  const baseId = block.blockId ?? `block-${idx}`;
  return expand(block.type, block.data as Data, {
    baseId,
    blockType: block.type,
    typeLabel: def.typeLabel,
    icon: def.icon,
    themeKey: def.themeKey,
    origin: "block",
    conversationId,
    editable: def.editable,
    raw: block,
  });
}
