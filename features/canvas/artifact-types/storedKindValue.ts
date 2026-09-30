/**
 * storedKindValue — ONE reading of "is this a registered kind value?" for
 * both halves of the artifact store:
 *
 *  - WRITE (planMaterialization): a JSON body carrying `__kind` plans as a
 *    STRUCTURED artifact (object `content.data` + `metadata.kind`).
 *  - READ (ArtifactRender / ArtifactRefBlock): a row whose `content.data` is
 *    a JSON STRING of a kind value rehydrates exactly like an object row.
 *
 * Why the read half exists: a kind payload can reach `canvas_items` as a
 * string (any path that missed the structured branch — 2026-09-30, an
 * `<artifact type="flashcards" id="mitosis-deck">{"__kind":"flashcard_set",…}`
 * body stored as a string). Rows are never rewritten by SQL, so the renderer
 * must read the string as the value it is — otherwise every such row renders
 * empty ("No flashcards available yet…"). Applies to EVERY materializable
 * kind, not one type.
 */

import { readObjectKind } from "@ai-matrx/content-ir";
import {
  resolveArtifactDefByKind,
  type ArtifactTypeDef,
} from "./artifact-type-registry";

export interface KindValueDetection {
  def: ArtifactTypeDef;
  kind: string;
  /** Zero-loss value object (carries `__kind` — self-describing). */
  structured: Record<string, unknown>;
}

/** A registered, materializable kind value parsed from JSON text, or null. */
export function detectKindInJsonText(
  text: string | null | undefined,
): KindValueDetection | null {
  const raw = (text ?? "").trim();
  if (!raw.startsWith("{") || !raw.endsWith("}")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const kind = readObjectKind(parsed as Record<string, unknown>);
  if (!kind) return null;
  const def = resolveArtifactDefByKind(kind);
  if (!def?.materializable) return null;
  return { def, kind, structured: parsed as Record<string, unknown> };
}

/**
 * The stored value to hand the kind rehydration route: a JSON-string kind
 * value becomes its object; everything else is returned unchanged.
 */
export function storedKindValue(data: unknown): unknown {
  if (typeof data !== "string") return data;
  return detectKindInJsonText(data)?.structured ?? data;
}
