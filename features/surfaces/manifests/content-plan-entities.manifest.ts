/**
 * Surface manifest — Content Plan Entities (`matrx-user/content-plan-entities`).
 *
 * The E-E-A-T entity manager view (`/marketing/content-plan/[siteId]?view=
 * entities`): the people, sources, media, and organizations behind the site's
 * content (`plan.entity`). Its agents reason about the ROSTER — coverage,
 * credibility, who should author or review what — a different job from plan
 * architecture or brief writing, which is why it is its own surface.
 *
 * Inherits `matrx-user/content-plan` (site identity + plan tree are loaded
 * and true here). Runtime emitter: `EntityManager.tsx` mounts a nested
 * `SurfaceRuntimeProvider` (deepest wins while the view is active).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "entity_roster",
    label: "Entity roster",
    sortOrder: 100,
    description: "The site's registered E-E-A-T entities in full detail.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "entities_detail",
    label: "Entities (full)",
    description:
      "Every `plan.entity` row for the site in full detail — id, label, entity_type (person | source | media | org), source_type_id, and attributes. Empty while loading or when the site has none yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 100,
    group: "entity_roster",
  },
  {
    name: "entity_counts_by_type",
    label: "Entity counts by type",
    description:
      "Object mapping each entity_type to its count (person/source/media/org). Empty while the roster loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 110,
    group: "entity_roster",
  },
];

export const contentPlanEntitiesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-plan-entities",
  label: "Content Plan Entities",
  readiness: "partial",
  readinessNote:
    "Emitter wired in EntityManager; per-entity attributes not audited field-by-field; no default agent bound to entity_curator yet.",
  urlPattern: "/marketing/content-plan/[siteId]?view=entities",
  inheritsFrom: "matrx-user/content-plan",
  intro: `<surface_intro>
You are on the E-E-A-T entity manager of the content plan: the people, sources, media, and organizations behind the site's content (plan.entity rows). The user maintains the roster here; nodes elsewhere attach these entities as author/reviewer/citation via association edges.
Read entities_detail for the full roster and entity_counts_by_type for the shape of it. The inherited plan_tree tells you what content exists — useful for spotting coverage gaps (e.g. medical articles with no reviewer-qualified person registered).
Suggestions belong to the roster: who is missing, whose credentials matter for this vertical, which sources are weak. Node-to-entity attachment happens on the node surfaces, not here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "entity_curator",
      label: "Entity curator",
      description:
        "Builds and audits the site's E-E-A-T roster — proposing the people, sources, and organizations the content needs, and flagging credibility gaps for the vertical.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
  ],
};

/** Type-safe payload helper — inherited `view` is the only guarantee. */
export function createContentPlanEntitiesScope(values: {
  view: "tree" | "table" | "map" | "entities" | "setup";
  entities_detail?: Array<Record<string, unknown>>;
  entity_counts_by_type?: Record<string, number>;
  site_id?: string;
  site_domain?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
