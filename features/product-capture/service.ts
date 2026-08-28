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
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import { folderForProductCaptureItem } from "@/features/files/utils/folder-conventions";

import type {
  CaptureFile,
  CaptureItem,
  ProductCaptureCodeSource,
  ProductCaptureFileKind,
  ProductCaptureFileRow,
  ProductCaptureItemRow,
} from "./types";

const ITEM_COLUMNS =
  "id, organization_id, code, code_source, notes, folder_path, status, created_at, version";
const FILE_COLUMNS = "id, item_id, file_id, kind, created_at";

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
    status: row.status === "processed" ? "processed" : "captured",
    createdAt: row.created_at,
    version: row.version,
  };
}

type FileRow = Pick<
  ProductCaptureFileRow,
  "id" | "item_id" | "file_id" | "kind" | "created_at"
>;

function toFile(row: FileRow): CaptureFile {
  return {
    id: row.id,
    itemId: row.item_id,
    fileId: row.file_id,
    kind: row.kind as ProductCaptureFileKind,
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
}): Promise<CaptureFile> {
  const { data, error } = await files()
    .insert({
      item_id: args.itemId,
      organization_id: args.organizationId,
      file_id: args.fileId,
      kind: args.kind,
    })
    .select(FILE_COLUMNS)
    .single();
  if (error) throw error;
  return toFile(data as FileRow);
}

/** Files of one item, in capture order. */
export async function listItemFiles(itemId: string): Promise<CaptureFile[]> {
  const { data, error } = await files()
    .select(FILE_COLUMNS)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as FileRow[]).map(toFile);
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
    list.push(toFile(row));
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
