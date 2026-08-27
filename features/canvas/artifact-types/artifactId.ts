/**
 * isMaterializedArtifactId — the R3 recognition primitive.
 *
 * An `<artifact>` (and every artifact renderer) carries an `id` that is EITHER:
 *  - a real `canvas_items` UUID → the artifact is MATERIALIZED (persisted). The
 *    UI renders the live row by id; data-touching types (tasks) can link/convert
 *    against the stable artifact id.
 *  - the model's own `artifact_N` (or a splitter fallback like `artifact-3`, or
 *    nothing) → NOT yet materialized → render inline; it's a materialization
 *    candidate, not a known artifact.
 *
 * This single UUID-shape test is what makes the whole system safe (vision R3):
 * it does NOT matter whether the model ever learns to emit the shape — a
 * non-UUID id is always treated as "new / unmaterialized", a UUID as "this exact
 * persisted artifact." Used by the renderers (render-by-id vs inline) and by
 * materialization (skip-already-materialized vs create-new).
 *
 * See `/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/VISION.md` (R1–R3).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a canonical UUID — i.e. a real, persisted `canvas_items.id`. */
export function isMaterializedArtifactId(id?: string | null): boolean {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

/**
 * readArtifactPointerId — the pointer-shape reader.
 *
 * A canvas item whose artifact has been MATERIALIZED stores only a POINTER in
 * `content.data`: `{ artifactId }`. The body lives in the `canvas_items` row.
 * Anything that consumes `content.data` (render, share, export) must recognise
 * that shape instead of treating the pointer as the content — publishing a
 * pointer produces a page with nothing in it.
 *
 * Returns the materialized artifact UUID, or undefined when `data` is real
 * content (string, or an object that is not a pointer).
 */
export function readArtifactPointerId(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  if (!("artifactId" in data)) return undefined;
  const id = (data as { artifactId?: unknown }).artifactId;
  return isMaterializedArtifactId(typeof id === "string" ? id : null)
    ? (id as string)
    : undefined;
}
