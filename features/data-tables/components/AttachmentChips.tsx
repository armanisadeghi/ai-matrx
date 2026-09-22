/**
 * AttachmentChips — an `attachment` cell's files as chips.
 *
 * The cell stores FILE IDS (the files feature's `files.files.id`); the chip
 * draws the name, type and size from the cloud-files store, so this component
 * only has to make sure each id is hydrated (`ensureCloudFileFields`, the one
 * loader every other file surface uses) and hand the ids to the ONE chip
 * (`FileChipList`). A file the caller cannot read stays a chip that says so —
 * the chip's own honest state, not a blank.
 */
"use client";

import { useEffect } from "react";

import { FileChipList } from "@/features/files/components/core/FileChip/FileChip";
import { ensureCloudFileFields } from "@/features/files/redux/thunks";
import { useAppDispatch } from "@/lib/redux/hooks";

export function useHydrateFiles(fileIds: readonly string[]): void {
  const dispatch = useAppDispatch();
  const key = fileIds.join("|");
  useEffect(() => {
    for (const fileId of key ? key.split("|") : []) {
      // The thunk is a no-op once the row is loaded and dedupes in-flight loads.
      void dispatch(ensureCloudFileFields({ fileId })).catch(() => undefined);
    }
  }, [dispatch, key]);
}

/** The stored value as a list of file ids — an array, a JSON string of one, or a comma list. */
export function attachmentIds(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch {
        // fall through to the comma list
      }
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function AttachmentChips({
  value,
  className,
  onRemove,
}: {
  value: unknown;
  className?: string;
  /** When given, each chip carries a remove control (edit mode). */
  onRemove?: (fileId: string) => void;
}) {
  const ids = attachmentIds(value);
  useHydrateFiles(ids);
  if (ids.length === 0) return null;
  return (
    <span onClick={(e) => e.stopPropagation()} className="contents">
      <FileChipList fileIds={ids} density="sm" showOpenButton onRemove={onRemove} className={className} />
    </span>
  );
}
