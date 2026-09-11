/**
 * features/product-capture/service.ts
 *
 * Persistence for product capture — direct Supabase, per the data-flow rule
 * (a plain row read/write never goes through the Python server). Bytes never
 * touch this module: photos/videos/audio upload through `fileHandler` (see
 * `uploads.ts`) and only the resulting `file_id` is linked here.
 *
 * Concurrency: notes can be written by two paths at once (the debounced
 * textarea autosave and a background transcript append landing after the
 * user moved on), so every item UPDATE goes through the platform's
 * `guardedUpdate` CAS on `version`. Appends re-apply on conflict — replaying
 * an append onto the row that actually landed preserves the other writer's
 * text instead of clobbering it.
 */

import { createClient } from "@/utils/supabase/client";
import { guardedUpdate } from "@ai-matrx/data/db";
import { readAllRows } from "@ai-matrx/data/db";
import { folderForProductCaptureItem } from "@/features/files/utils/folder-conventions";
import { isJsonObject } from "@/types/json";

import type {
  CaptureFile,
  CaptureItem,
  CaptureVideoFacts,
  ProductCaptureCodeSource,
  ProductCaptureFileKind,
  ProductCaptureFileRow,
  ProductCaptureItemRow,
} from "./types";

const ITEM_COLUMNS =
  "id, organization_id, code, code_source, notes, folder_path, status, created_at, version";
const FILE_COLUMNS = "id, item_id, file_id, kind, metadata, created_at";

function items() {
  return createClient().schema("workbench").from("product_capture_item");
}

function files() {
  return createClient().schema("workbench").from("product_capture_file");
}

type ItemRow = Pick<
  ProductCaptureItemRow,
  | "id"
  | "organization_id"
  | "code"
  | "code_source"
  | "notes"
  | "folder_path"
  | "status"
  | "created_at"
  | "version"
>;

function toItem(row: ItemRow): CaptureItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    codeSource: (row.code_source as CaptureItem["codeSource"]) ?? null,
    notes: row.notes,
    folderPath: row.folder_path,
    status:
      row.status === "processed" || row.status === "capturing"
        ? row.status
        : "captured",
    createdAt: row.created_at,
    version: row.version,
  };
}

type FileRow = Pick<
  ProductCaptureFileRow,
  "id" | "item_id" | "file_id" | "kind" | "metadata" | "created_at"
>;

function readVideoFacts(
  kind: ProductCaptureFileKind,
  metadata: unknown,
): CaptureVideoFacts | null {
  if (!isJsonObject(metadata) || metadata.video === undefined) return null;
  if (kind !== "video") {
    throw new Error(
      "[product-capture] non-video file link cannot carry metadata.video.",
    );
  }
  if (!isJsonObject(metadata.video)) {
    throw new Error(
      "[product-capture] file-link metadata.video must be an object.",
    );
  }
  const mime = metadata.video.mime;
  const durationMs = metadata.video.duration_ms;
  if (
    typeof mime !== "string" ||
    !mime.startsWith("video/") ||
    typeof durationMs !== "number" ||
    !Number.isInteger(durationMs) ||
    durationMs <= 0
  ) {
    throw new Error(
      "[product-capture] file-link video metadata requires a video MIME and positive integer duration_ms.",
    );
  }
  return { mime, durationMs };
}

export function toCaptureFile(row: FileRow): CaptureFile {
  return {
    id: row.id,
    itemId: row.item_id,
    fileId: row.file_id,
    kind: row.kind as ProductCaptureFileKind,
    video: readVideoFacts(row.kind as ProductCaptureFileKind, row.metadata),
    createdAt: row.created_at,
  };
}

/**
 * Create an item. The id is generated client-side so the per-item cloud
 * folder (`Product Captures/<org>/<code-or-id>`) can be fixed in the same
 * single INSERT — the folder is never renamed after creation, even if a code
 * is assigned later (the code then lives on the row + in file metadata).
 */
export async function createItem(args: {
  organizationId: string;
  code?: string | null;
  codeSource?: ProductCaptureCodeSource;
}): Promise<CaptureItem> {
  const id = crypto.randomUUID();
  const code = args.code?.trim() || null;
  const leaf = code ?? id;
  let folderPath = folderForProductCaptureItem(args.organizationId, leaf);
  if (folderPath.endsWith("/")) {
    // The code sanitized to nothing — fall back to the item id.
    folderPath = folderForProductCaptureItem(args.organizationId, id);
  }
  const { data, error } = await items()
    .insert({
      id,
      organization_id: args.organizationId,
      code,
      code_source: code ? (args.codeSource ?? "manual") : null,
      folder_path: folderPath,
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return toItem(data as ItemRow);
}

export async function loadItem(itemId: string): Promise<CaptureItem | null> {
  const { data, error } = await items()
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toItem(data as ItemRow) : null;
}

/** Recent items of the org, newest first (the review sheet's read). A short
 *  list is an acceptable answer here — rendering, not a completeness check. */
export async function listRecentItems(
  organizationId: string,
  limit = 50,
): Promise<CaptureItem[]> {
  const { data, error } = await items()
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ItemRow[]).map(toItem);
}

/** EVERY item of the org, newest first — the manage page's read. Complete by
 *  contract (`readAllRows`): the list drives management decisions, and a
 *  silent 1000-row cap would hide real items. */
export async function listAllItems(
  organizationId: string,
): Promise<CaptureItem[]> {
  const rows = await readAllRows<ItemRow>(
    ({ from, to }) =>
      items()
        .select(ITEM_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "workbench.product_capture_item" },
  );
  return rows.map(toItem);
}

/** EVERY file link of the org (for the manage page's counts + thumbnails),
 *  grouped by item. Complete by contract, same reason as `listAllItems`. */
export async function listAllFiles(
  organizationId: string,
): Promise<Map<string, CaptureFile[]>> {
  const rows = await readAllRows<FileRow>(
    ({ from, to }) =>
      files()
        .select(FILE_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "workbench.product_capture_file" },
  );
  const map = new Map<string, CaptureFile[]>();
  for (const row of rows) {
    const list = map.get(row.item_id) ?? [];
    list.push(toCaptureFile(row));
    map.set(row.item_id, list);
  }
  return map;
}

type ItemPatch = Partial<
  Pick<ProductCaptureItemRow, "code" | "code_source" | "notes" | "status">
>;

/**
 * One CAS attempt of `mutate(current)` onto the item, retried once on a
 * version conflict against the row that actually landed. Returns the saved
 * item; throws after a second conflict rather than looping.
 */
async function guardedItemWrite(
  item: CaptureItem,
  mutate: (current: CaptureItem) => ItemPatch,
): Promise<CaptureItem> {
  const attempt = async (
    current: CaptureItem,
  ): Promise<{ saved: CaptureItem } | { conflict: CaptureItem }> => {
    const patch = mutate(current);
    const result = await guardedUpdate<ItemRow & { version: number }>({
      expectedVersion: current.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        items()
          .update({ ...patch, version: nextVersion })
          .eq("id", current.id)
          .eq("version", expectedVersion)
          .select(ITEM_COLUMNS)
          .maybeSingle(),
      fetchCurrent: () =>
        items().select(ITEM_COLUMNS).eq("id", current.id).maybeSingle(),
    });
    if (result.status === "saved") return { saved: toItem(result.row) };
    if (result.status === "conflict")
      return { conflict: toItem(result.currentRow) };
    throw new Error("This capture item no longer exists.");
  };

  const first = await attempt(item);
  if ("saved" in first) return first.saved;
  const second = await attempt(first.conflict);
  if ("saved" in second) return second.saved;
  throw new Error(
    "Could not save — someone else is editing this item at the same moment.",
  );
}

/** Assign / change the product code (QR value or typed SKU). */
export async function setItemCode(
  item: CaptureItem,
  code: string,
  source: ProductCaptureCodeSource,
): Promise<CaptureItem> {
  const trimmed = code.trim();
  return guardedItemWrite(item, () => ({
    code: trimmed || null,
    code_source: trimmed ? source : null,
  }));
}

/** Replace the item's notes (the textarea autosave path). */
export async function setItemNotes(
  item: CaptureItem,
  notes: string,
): Promise<CaptureItem> {
  return guardedItemWrite(item, () => ({ notes }));
}

/**
 * Append text to the item's notes (the background transcript path). Reads
 * the row it lands on, so an append that arrives after the user typed more —
 * or moved to another device — never clobbers.
 */
export async function appendToItemNotes(
  itemId: string,
  text: string,
): Promise<CaptureItem> {
  const current = await loadItem(itemId);
  if (!current) throw new Error("This capture item no longer exists.");
  return guardedItemWrite(current, (row) => ({
    notes: row.notes ? `${row.notes}\n\n${text}` : text,
  }));
}

/**
 * Close the item — the photographer moved on (Next / QR-advance / "mark
 * ready"). The DB transition `capturing → captured` is what fires the
 * product-capture workflow event trigger (the table is instrumented with
 * `workflow.watch_table`), so this write IS the handoff. Also the reprocess
 * action: flipping a `processed` item back to `captured` fires the
 * transition again.
 */
export async function closeItem(item: CaptureItem): Promise<CaptureItem> {
  if (item.status === "captured") return item;
  // 🚨 `processed` is TERMINAL — never walk it backwards to `captured`. That
  // write is the server workflow's trigger, so a close landing on an item the
  // INSTANT lane already analyzed re-runs the whole pipeline on it (and loses
  // the processed status on the way). A legitimate re-capture goes through
  // `reopenItem` first, which puts the row back at `capturing`.
  if (item.status === "processed") return item;
  return guardedItemWrite(item, () => ({ status: "captured" }));
}

/**
 * Reopen an item on the capture surface (deep link / review-sheet resume):
 * back to `capturing` so downstream consumers know it is mid-capture again.
 * Closing it later re-fires the transition — more photos mean a reprocess.
 */
export async function reopenItem(item: CaptureItem): Promise<CaptureItem> {
  if (item.status === "capturing") return item;
  return guardedItemWrite(item, () => ({ status: "capturing" }));
}

/**
 * INSTANT-lane terminal write: `capturing → processed` DIRECTLY. The item
 * never enters `captured`, so the server-side workflow trigger (which fires
 * on the capturing → captured transition — see `closeItem`) can never
 * double-process an item the client lane already analyzed. The lane
 * distinction is which transition the item took, not a new status value.
 */
export async function markProcessed(item: CaptureItem): Promise<CaptureItem> {
  if (item.status === "processed") return item;
  return guardedItemWrite(item, () => ({ status: "processed" }));
}

/** Soft-delete an item. Its uploaded files stay in the org's file tree. */
export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await items()
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
}

/** Link an uploaded file to an item (called after `fileHandler.upload`). */
export async function linkFile(args: {
  itemId: string;
  organizationId: string;
  fileId: string;
  kind: ProductCaptureFileKind;
  video?: CaptureVideoFacts;
}): Promise<CaptureFile> {
  if (args.kind === "video" && !args.video) {
    throw new Error(
      "[product-capture] video links require normalized MIME and duration.",
    );
  }
  if (args.kind !== "video" && args.video) {
    throw new Error(
      "[product-capture] video metadata cannot be attached to a non-video link.",
    );
  }
  const { data, error } = await files()
    .insert({
      item_id: args.itemId,
      organization_id: args.organizationId,
      file_id: args.fileId,
      kind: args.kind,
      ...(args.video
        ? {
            metadata: {
              video: {
                mime: args.video.mime,
                duration_ms: args.video.durationMs,
              },
            },
          }
        : {}),
    })
    .select(FILE_COLUMNS)
    .single();
  if (error) throw error;
  return toCaptureFile(data as FileRow);
}

/** Files of one item, in capture order. */
export async function listItemFiles(itemId: string): Promise<CaptureFile[]> {
  const { data, error } = await files()
    .select(FILE_COLUMNS)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as FileRow[]).map(toCaptureFile);
}

/** Number of product-capture relations that currently reference one file.
 *  Upload deduplication may legitimately make this greater than one. */
export async function countFileLinks(fileId: string): Promise<number> {
  const { count, error } = await files()
    .select("id", { count: "exact", head: true })
    .eq("file_id", fileId);
  if (error) throw error;
  return count ?? 0;
}

/** Whether the canonical cloud-file row is still live. A stale capture link
 *  can outlive a previously deleted file; cleanup of that relation is an
 *  idempotent success, not another attempt to delete missing storage. */
export async function isActiveCloudFile(fileId: string): Promise<boolean> {
  const { data, error } = await createClient()
    .schema("files")
    .from("files")
    .select("id")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Files of many items at once (the review sheet's thumbnails/counts). */
export async function listFilesForItems(
  itemIds: string[],
): Promise<Map<string, CaptureFile[]>> {
  const map = new Map<string, CaptureFile[]>();
  if (itemIds.length === 0) return map;
  const { data, error } = await files()
    .select(FILE_COLUMNS)
    .in("item_id", itemIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  for (const row of (data ?? []) as FileRow[]) {
    const list = map.get(row.item_id) ?? [];
    list.push(toCaptureFile(row));
    map.set(row.item_id, list);
  }
  return map;
}

/** Unlink a file row (the retake/delete path — cloud-file removal is the
 *  caller's concern, best-effort). */
export async function unlinkFile(linkId: string): Promise<void> {
  const { error } = await files().delete().eq("id", linkId);
  if (error) throw error;
}
