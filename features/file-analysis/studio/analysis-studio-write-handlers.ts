/**
 * features/file-analysis/studio/analysis-studio-write-handlers.ts
 *
 * The receiving end of the write half of `matrx-user/analysis-studio`.
 *
 * `StudioShell` mounts the surface provider, so it also owns the handlers for
 * the targets the manifest declares. They are built here, away from the shell,
 * because the interesting part is not the wiring — it is the REFUSALS.
 *
 * Every content write goes through the caller-supplied `updateAnnotation`,
 * which is `useAnnotations(fileId).update` — the same function the region
 * context menu writes `extracted_text` with and the canvas writes a dragged
 * `bbox` with. No parallel path, no supabase from here.
 *
 * Three things make an annotation write unsafe, and each one throws (the
 * writeback seam turns a throw into the loud toast + captured error the agent
 * reads back):
 *
 *  1. **No annotation in scope.** An annotation write needs an annotation. If
 *     the caller passed no `annotation_id` and the user has nothing selected,
 *     there is no "current region" to write into — refuse rather than guess.
 *  2. **An id that is not on this document.** An id from another file, a
 *     deleted region, or a hallucinated uuid must not silently no-op. Only
 *     ACTIVE annotations of the loaded document resolve.
 *  3. **A write already in flight.** `useAnnotations.update` patches the
 *     shared cache optimistically, so a second write launched mid-flight would
 *     validate against, and could clobber, a row that is still settling. One
 *     at a time.
 *
 * And one more thing makes a write a LIE: `update` resolves with the row the
 * server actually stored. A 4xx rejects (putJson throws on !ok) — but a server
 * that accepts the PUT and quietly normalises the field away would otherwise
 * hand the agent a success toast for a change that never landed. So each
 * content handler re-reads the returned row and throws when the value is not
 * what it asked for.
 */

import type {
  AnnotationOut,
  AnnotationUpdateBody,
  LabelCatalogEntry,
} from "@/features/file-analysis/api/file-analysis";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

/**
 * The category the label picker falls back to when the user types a custom
 * label without picking a category chip (`LabelPicker.finalLabelCategory`).
 * The only category value that is legal WITHOUT being a catalog key.
 */
export const CUSTOM_LABEL_CATEGORY = "custom";

/** Wire value for the `annotation_label` target. */
export interface AnnotationLabelWrite {
  label: string;
  annotation_id?: string;
  label_category?: string;
}

/** Wire value for the `annotation_extracted_text` target. */
export interface AnnotationExtractedTextWrite {
  text: string;
  annotation_id?: string;
}

/** Wire value for the `studio_focus_annotation` target. */
export interface StudioFocusAnnotationWrite {
  annotation_id: string;
}

/** Wire value for the `annotation_redact` target. */
export interface AnnotationRedactWrite {
  redact: boolean;
  annotation_id?: string;
}

export interface AnalysisStudioWriteDeps {
  /** Every annotation loaded for the open file (active + not). */
  annotations: AnnotationOut[];
  /** The region the user has selected, if any — the implicit write scope. */
  selectedAnnotationId: string | null;
  /** Label catalog entries; the ONLY source of the label/category vocabulary. */
  labels: LabelCatalogEntry[];
  /** Catalog category keys → display names (`LabelCatalogResponse.categories`). */
  categories: Record<string, string>;
  /** `useAnnotations(fileId).update` — the canonical annotation write. */
  updateAnnotation: (
    annotationId: string,
    body: AnnotationUpdateBody,
  ) => Promise<AnnotationOut>;
  /**
   * Select an annotation AND jump to its page in ONE commit.
   *
   * Deliberately one callback rather than the shell's separate
   * `handleSelectAnnotation` + `handlePageChange`: those each rebuild the
   * query string from the same `searchParams` snapshot, so calling both in a
   * single tick — which is exactly what a write handler does — made the
   * second `router.replace` start from the pre-change URL and drop the first
   * one's param. The canvas looked right; a reload lost the selection.
   */
  focusAnnotation: (annotationId: string, pageNumber: number) => void;
  /** Shared across handlers: true while an annotation write is in flight. */
  writeInFlight: { current: boolean };
}

// ── input validation ────────────────────────────────────────────────────────
// Nothing is coerced. A wrong shape is the caller's error to hear about.

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string {
  const raw = obj[key];
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string.`);
  }
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${target}: ${key} must not be empty.`);
  return trimmed;
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string when provided.`);
  }
  return raw.trim() || undefined;
}

/**
 * The annotation a write applies to: the explicit `annotation_id`, else the
 * user's selection. Refusals 1 and 2 from the module header live here.
 */
function resolveAnnotation(
  obj: Record<string, unknown>,
  deps: AnalysisStudioWriteDeps,
  target: string,
): AnnotationOut {
  const explicitId = optionalString(obj, "annotation_id", target);
  const id = explicitId ?? deps.selectedAnnotationId?.trim() ?? "";
  if (!id) {
    throw new Error(
      `${target}: no annotation is open. Pass annotation_id (the \`id\` of a row in the annotations value), or ask the user to click the region on the page first.`,
    );
  }
  const hit = deps.annotations.find(
    (a) => a.id === id && a.status === "active",
  );
  if (!hit) {
    throw new Error(
      `${target}: "${id}" is not an active annotation on this document. Use an \`id\` from the annotations value of the open file.`,
    );
  }
  return hit;
}

/** Refusal 3 — serialise annotation writes, and always release the lock. */
async function withWriteLock<T>(
  deps: AnalysisStudioWriteDeps,
  target: string,
  run: () => Promise<T>,
): Promise<T> {
  if (deps.writeInFlight.current) {
    throw new Error(
      `${target}: another annotation write is still saving. Wait for it to finish, then try again.`,
    );
  }
  deps.writeInFlight.current = true;
  try {
    return await run();
  } finally {
    deps.writeInFlight.current = false;
  }
}

/**
 * Resolve `{label, label_category}` exactly the way the label picker does:
 * a catalog label carries the catalog's category; a custom label needs one
 * spelled out, from the catalog's category keys (or the picker's `custom`).
 */
function resolveLabelAndCategory(
  obj: Record<string, unknown>,
  deps: AnalysisStudioWriteDeps,
  target: string,
): { label: string; label_category: string } {
  const label = requiredString(obj, "label", target);
  const requestedCategory = optionalString(obj, "label_category", target);

  if (deps.labels.length === 0) {
    throw new Error(
      `${target}: the label catalog has not loaded yet, so the label cannot be validated. Try again in a moment.`,
    );
  }

  const catalogEntry = deps.labels.find((entry) => entry.id === label);
  if (catalogEntry) {
    // The catalog owns the pairing. Honouring a conflicting category would
    // produce a label/category combination the user's own picker cannot make.
    if (requestedCategory && requestedCategory !== catalogEntry.category) {
      throw new Error(
        `${target}: label "${label}" is a catalog label in category "${catalogEntry.category}"; it cannot be filed under "${requestedCategory}". Omit label_category for catalog labels.`,
      );
    }
    return { label, label_category: catalogEntry.category };
  }

  // Custom label — same fallback the picker offers, but the category has to
  // be named, because there is no catalog entry to take it from. The catalog
  // usually ships `custom` as a category of its own; de-dupe so the vocabulary
  // an agent is handed never lists the same key twice.
  const validCategories = Array.from(
    new Set([...Object.keys(deps.categories), CUSTOM_LABEL_CATEGORY]),
  );
  if (!requestedCategory) {
    throw new Error(
      `${target}: "${label}" is not a label-catalog id, so it is a custom label and label_category is required. Valid categories: ${validCategories.join(", ")}.`,
    );
  }
  if (!validCategories.includes(requestedCategory)) {
    throw new Error(
      `${target}: "${requestedCategory}" is not a valid annotation category. Valid categories: ${validCategories.join(", ")}.`,
    );
  }
  return { label, label_category: requestedCategory };
}

/**
 * Build the surface's write handlers. Called at APPLY time through the
 * provider's ref, so `deps` is always this render's live state.
 */
export function buildAnalysisStudioWriteHandlers(
  deps: AnalysisStudioWriteDeps,
): SurfaceWriteHandlers {
  return {
    annotation_label: async (value: unknown) => {
      const target = "annotation_label";
      const obj = asRecord(value, target);
      const annotation = resolveAnnotation(obj, deps, target);
      const { label, label_category } = resolveLabelAndCategory(
        obj,
        deps,
        target,
      );

      await withWriteLock(deps, target, async () => {
        const saved = await deps.updateAnnotation(annotation.id, {
          label,
          label_category,
        });
        if (saved.label !== label || saved.label_category !== label_category) {
          throw new Error(
            `${target}: the server stored "${saved.label}" / "${saved.label_category}" instead of "${label}" / "${label_category}" — the change did not land.`,
          );
        }
      });
    },

    annotation_extracted_text: async (value: unknown) => {
      const target = "annotation_extracted_text";
      const obj = asRecord(value, target);
      const annotation = resolveAnnotation(obj, deps, target);
      const text = requiredString(obj, "text", target);

      await withWriteLock(deps, target, async () => {
        const saved = await deps.updateAnnotation(annotation.id, {
          extracted_text: text,
        });
        if ((saved.extracted_text ?? "").trim() !== text) {
          throw new Error(
            `${target}: the annotation's text still reads "${(saved.extracted_text ?? "").slice(0, 80)}" — the change did not land.`,
          );
        }
      });
    },

    studio_focus_annotation: (value: unknown) => {
      const target = "studio_focus_annotation";
      const obj = asRecord(value, target);
      // No selection fallback: focusing "whatever is already focused" is not
      // a request anyone means to make.
      requiredString(obj, "annotation_id", target);
      const annotation = resolveAnnotation(obj, deps, target);
      deps.focusAnnotation(annotation.id, annotation.page_number);
    },

    annotation_redact: async (value: unknown) => {
      const target = "annotation_redact";
      const obj = asRecord(value, target);
      const annotation = resolveAnnotation(obj, deps, target);
      const redact = obj.redact;
      if (typeof redact !== "boolean") {
        throw new Error(
          `${target}: redact must be true or false. Pass true to mark the region for the redaction pass, false to clear the mark.`,
        );
      }

      await withWriteLock(deps, target, async () => {
        const saved = await deps.updateAnnotation(annotation.id, { redact });
        if ((saved.redact ?? false) !== redact) {
          throw new Error(
            `${target}: the region is still ${saved.redact ? "marked" : "unmarked"} — the change did not land.`,
          );
        }
      });
    },
  };
}
