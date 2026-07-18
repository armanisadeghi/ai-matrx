/**
 * Shapes studio constants — the user-facing Shape System surface.
 *
 * ROUTE RENAME IS ONE CONSTANT: every link, nav entry, and route helper in the
 * studio derives from `SHAPES_ROUTE_BASE`. The app/(core)/shapes directory name
 * is the only other thing to touch if the product name changes.
 */

export const SHAPES_ROUTE_BASE = "/shapes";

export const SHAPES_FEATURE_LABEL = "Shapes";

/**
 * The shape-creator agent (built server-side by the aidream lane — its id
 * lands in docs/handoffs/content-ir-integration-map.md when ready). Empty
 * string = not configured; the studio shows a LOUD not-configured state and
 * never silently falls back to another agent.
 */
export const SHAPE_CREATOR_AGENT_ID = "4f4ffd49-db15-4a2e-b9fe-341ffafc1323"; // kind_creator (builtin, K2 lane 2026-07-18)

/** Null when the creator agent is not configured yet (loud empty-state). */
export function shapeCreatorAgentId(): string | null {
  const id = SHAPE_CREATOR_AGENT_ID.trim();
  return id.length > 0 ? id : null;
}

export function shapeDetailHref(kind: string): string {
  return `${SHAPES_ROUTE_BASE}/${encodeURIComponent(kind)}`;
}

export function shapeTestHref(kind: string): string {
  return `${shapeDetailHref(kind)}/test`;
}

export function shapeSchemaHref(kind: string): string {
  return `${shapeDetailHref(kind)}/schema`;
}

export function shapeInstancesHref(kind: string): string {
  return `${shapeDetailHref(kind)}/instances`;
}

/**
 * Canonical per-instance permalink — MUST stay in lockstep with the
 * `content_ir_kind_instance` sharing-registry `url_path_template`
 * (`/shapes/instances/{id}`). Resolved by `app/(core)/shapes/instances/[id]`,
 * which looks up the instance's kind and redirects to
 * `/shapes/[kind]/instances?i=<id>`.
 */
export function shapeInstancePermalink(id: string): string {
  return `${SHAPES_ROUTE_BASE}/instances/${encodeURIComponent(id)}`;
}

export const SHAPES_NEW_HREF = `${SHAPES_ROUTE_BASE}/new`;
