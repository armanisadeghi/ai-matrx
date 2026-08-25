/**
 * Shapes studio constants — the user-facing Shape System surface.
 *
 * ROUTE RENAME IS ONE CONSTANT: every link, nav entry, and route helper in the
 * studio derives from `SHAPES_ROUTE_BASE`. The app/(core)/shapes directory name
 * is the only other thing to touch if the product name changes.
 */

export const SHAPES_ROUTE_BASE = "/shapes";
export const SHAPES_ALL_HREF = `${SHAPES_ROUTE_BASE}/all`;

export const SHAPES_FEATURE_LABEL = "Shapes";

/**
 * The shape-creator agent is a MANDATE — `content_ir.kind_creator` — resolved at
 * trigger time via `features/agents/mandates` (`resolveMandate` /
 * `useMandate`; system default → the user's own binding). Consumers stay
 * LOUD on a resolution failure (toast / not-configured state) and never
 * silently fall back to another agent. The mandate's system default is the
 * kind_creator builtin (master 4f4ffd49-…, K2 lane 2026-07-18); rebind in the
 * admin mandate console, never in code.
 */
export const KIND_CREATOR_MANDATE_KEY = "content_ir.kind_creator";

/**
 * The studio's own surface, and the agent ROLES declared on it
 * (`features/surfaces/manifests/shapes.manifest.ts` → `agentRoles`, mirrored
 * to `ui.ui_surface_agent_role`). Every "do this with AI" affordance in the
 * studio launches a role by name so the agent is the one MAPPED to this
 * surface — visible in the header Agents menu, overridable per user/org —
 * never a UUID or a mandate resolved inside a component.
 */
export const SHAPES_SURFACE_NAME = "matrx-user/shapes";
/** Creates a new Shape and edits an existing one. Mandate: kind_creator. */
export const SHAPE_BUILDER_ROLE = "shape_builder";
/** Builds/improves the component that draws a Shape. Mandate: component_artisan. */
export const SHAPE_COMPONENT_ROLE = "component_artisan";

/**
 * Slugs shadowed by the STATIC route segments under `app/(core)/shapes/` —
 * a kind named one of these would be unreachable (`/shapes/instances` etc.
 * resolves to the static segment, never `[kind]`). Creation paths refuse
 * them. Adding a static segment under /shapes = add its slug here.
 */
export const RESERVED_SHAPE_SLUGS: ReadonlySet<string> = new Set([
  "instances",
  "new",
  "admin",
  "all",
  "id",
]);

export function shapeDetailHref(kind: string): string {
  return `${SHAPES_ROUTE_BASE}/${encodeURIComponent(kind)}`;
}

export function shapeTestHref(kind: string): string {
  return `${shapeDetailHref(kind)}/test`;
}

export function shapeSchemaHref(kind: string): string {
  return `${shapeDetailHref(kind)}/schema`;
}

export function shapeStreamHref(kind: string): string {
  return `${shapeDetailHref(kind)}/stream`;
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
