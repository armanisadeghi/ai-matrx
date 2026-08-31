/**
 * Pure action guards for the Images surface.
 *
 * Keep these outside React so the two load-bearing guarantees can be proved:
 * selection writes validate the whole current visible set before mutation, and
 * URL resolution is exclusive even before React has committed its busy state.
 */

import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import type { CloudFileRecord } from "@/features/files/types";
import { isImageMime, resolveMime } from "@/features/files/utils/file-types";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";

type FilterableCloudImage = Pick<
  CloudFileRecord,
  "id" | "fileName" | "mimeType" | "createdAt" | "updatedAt" | "deletedAt"
>;

/**
 * The one pure projection used by both gallery rendering and filter-change
 * selection pruning. `recentsCutoff` is captured by the initiating event so
 * render stays deterministic.
 */
export function selectVisibleCloudImages<T extends FilterableCloudImage>(
  files: readonly T[],
  query: string,
  recentsCutoff: number | null,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  return files
    .filter((file) => {
      if (file.deletedAt) return false;
      if (!isImageMime(resolveMime(file.mimeType, file.fileName))) return false;

      if (recentsCutoff !== null) {
        const timestamp = file.updatedAt
          ? new Date(file.updatedAt).getTime()
          : file.createdAt
            ? new Date(file.createdAt).getTime()
            : 0;
        if (timestamp < recentsCutoff) return false;
      }

      return (
        !normalizedQuery ||
        file.fileName.toLowerCase().includes(normalizedQuery) ||
        idMatchesQuery(file, normalizedQuery)
      );
    })
    .sort((left, right) => {
      const leftTimestamp = left.updatedAt
        ? new Date(left.updatedAt).getTime()
        : 0;
      const rightTimestamp = right.updatedAt
        ? new Date(right.updatedAt).getTime()
        : 0;
      return rightTimestamp - leftTimestamp;
    });
}

/** Permanently drop selected ids that the next rendered filter cannot show. */
export function pruneImageSelectionToVisible(
  selectedIds: readonly string[],
  visibleImages: ReadonlyArray<{ id: string }>,
): string[] {
  const visibleIds = new Set(visibleImages.map((file) => file.id));
  return selectedIds.filter((id) => visibleIds.has(id));
}

export function parseImagesSearchQuery(value: unknown): string {
  if (typeof value !== "string") {
    refuseSurfaceWrite(
      `search_query expects a string (pass "" to clear the search) — received ${typeof value}.`,
    );
  }
  return value;
}

export function parseImagesRecentsOnly(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  refuseSurfaceWrite(
    `recents_only expects a boolean (true to show only the last 30 days, false to show the whole library) — received ${typeof value}.`,
  );
}

export function parseVisibleImageSelection(
  value: unknown,
  visibleImages: ReadonlyArray<{ id: string; fileName: string }>,
): string[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      refuseSurfaceWrite(
        'image_selection expects an array of image ids, e.g. ["<uuid>", "<uuid>"] — received a string that is not valid JSON.',
      );
    }
  }
  if (!Array.isArray(raw)) {
    refuseSurfaceWrite(
      `image_selection expects an array of image ids (pass [] to clear the selection) — received ${typeof raw}.`,
    );
  }

  const ids = raw.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      refuseSurfaceWrite(
        `image_selection entry ${index} is not an image id string.`,
      );
    }
    return entry.trim();
  });

  const visibleIds = new Set(visibleImages.map((file) => file.id));
  const unknown = ids.filter((id) => !visibleIds.has(id));
  if (unknown.length > 0) {
    const live = visibleImages
      .slice(0, 30)
      .map((file) => `${file.id} (${file.fileName})`)
      .join(", ");
    const more =
      visibleImages.length > 30
        ? `, …and ${visibleImages.length - 30} more`
        : "";
    refuseSurfaceWrite(
      `image_selection rejected: ${unknown.length} of the ${ids.length} id(s) you sent are not among the ${visibleImages.length} image(s) currently visible — ${unknown.join(", ")}. ` +
        `The selection was left unchanged. Note that applying search_query or recents_only changes this set, so ids you read before those writes may no longer be visible. ` +
        `Currently selectable: ${live || "(nothing — the search or Recents filter is hiding every image)"}${more}.`,
    );
  }

  return Array.from(new Set(ids));
}

export interface ExclusiveOperationGate {
  readonly activeId: string | null;
  tryStart(id: string): boolean;
  finish(id: string): void;
}

/**
 * Synchronous gate for async UI work. React state is a rendering signal, not
 * a mutex: two clicks can occur before a disabled prop is committed.
 */
export function createExclusiveOperationGate(): ExclusiveOperationGate {
  let activeId: string | null = null;
  return {
    get activeId() {
      return activeId;
    },
    tryStart(id) {
      if (activeId !== null) return false;
      activeId = id;
      return true;
    },
    finish(id) {
      if (activeId === id) activeId = null;
    },
  };
}
