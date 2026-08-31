/**
 * Pure action guards for the Images surface.
 *
 * Keep these outside React so the two load-bearing guarantees can be proved:
 * selection writes validate the whole current visible set before mutation, and
 * URL resolution is exclusive even before React has committed its busy state.
 */

export function parseVisibleImageSelection(
  value: unknown,
  visibleImages: ReadonlyArray<{ id: string; fileName: string }>,
): string[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error(
        'image_selection expects an array of image ids, e.g. ["<uuid>", "<uuid>"] — received a string that is not valid JSON.',
      );
    }
  }
  if (!Array.isArray(raw)) {
    throw new Error(
      `image_selection expects an array of image ids (pass [] to clear the selection) — received ${typeof raw}.`,
    );
  }

  const ids = raw.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(
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
    throw new Error(
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
