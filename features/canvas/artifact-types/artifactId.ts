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
 * See `features/artifacts/docs/ARTIFACT_VISION_AND_DESIGN.md` (R1–R3).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a canonical UUID — i.e. a real, persisted `canvas_items.id`. */
export function isMaterializedArtifactId(id?: string | null): boolean {
  return typeof id === "string" && UUID_RE.test(id.trim());
}
