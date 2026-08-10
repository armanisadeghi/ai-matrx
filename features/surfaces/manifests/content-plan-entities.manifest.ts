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

import { PLAN_ENTITY_TYPES } from "@/features/marketing/content-plan/types";
import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * THE entity_type vocabulary, imported from the feature's canonical constant —
 * the same list the editor's Type select renders, the write handlers validate
 * against, and the target descriptions below interpolate. Re-typing it here as
 * literals is how a manifest starts lying about what the page accepts.
 */
const ENTITY_TYPE_LIST = PLAN_ENTITY_TYPES.join(" | ");

const groups: SurfaceValueGroup[] = [
  {
    key: "entity_roster",
    label: "Entity roster",
    sortOrder: 100,
    description: "The site's registered E-E-A-T entities in full detail.",
  },
  {
    key: "entity_editor",
    label: "Entity editor",
    sortOrder: 200,
    description:
      "The open New/Edit entity dialog — its staged draft, and saving it.",
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
  {
    name: "entity_editor_draft",
    label: "Entity editor draft",
    description:
      'The open New/Edit entity dialog\'s staged draft — `{ mode: "new" | "edit", entity_id, label, entity_type, source_type_id }`. `entity_id` is null while creating. Nothing in it is written until the user presses Save/Create. Empty when no editor is open.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    sortOrder: 200,
    group: "entity_editor",
  },
];

/**
 * Write half of the 360 loop — what an agent may write into the entity
 * manager. The roster IS this surface's job (the intro tells agents to reason
 * about who is missing and whose credentials matter), so the two things worth
 * opening are the EDITOR DRAFT and ROSTER ADDITIONS.
 *
 * `entity_draft` is `mode: "draft"`: the dialog holds a real staging buffer
 * (the same state the user's typing fills, read back as `entity_editor_draft`)
 * and nothing reaches the DB until Save/Create. `save_entity_draft` and
 * `add_entities` are `mode: "entity"` — they run the dialog's own
 * create/update mutations and persist immediately.
 *
 * Deliberately NOT declared, and not to be added later without re-reading the
 * surface intro:
 *  - `id` / `site_id` / `organization_id` — identity, never agent-set.
 *  - DELETION (the row's trash button) — destructive stays human.
 *  - node↔entity ATTACHMENT (author / reviewer / citation edges) — those live
 *    on the NODE surfaces by design; this surface maintains the roster only.
 *  - `source_type_id` — a `plan_source_type` category UUID with no options
 *    exposed to agents as a read value (same reason `content-plan-node` keeps
 *    `node_primary_keyword_id` manual). The user picks it in the dialog.
 *
 * All targets are `applyPolicy: "ask"`. Handlers are registered by
 * `EntityManager.tsx` via `useSurfaceWriteHandlers`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "entity_draft",
    label: "Entity editor draft",
    description:
      "Stages values into the OPEN entity editor dialog — the same staging buffer the user's own typing fills. NOTHING is saved: the user reviews the dialog and presses Save/Create (or `save_entity_draft`). Object with optional keys `label` (non-empty string — the entity's display name, e.g. \"Dr. Jane Smith, MD, FACC\") and `entity_type` (exactly one of: person | source | media | org); provide at least one. Read `entity_editor_draft` for what is staged now. Fails when no entity editor is open — the user has to open New/Edit first. Source type is not settable here.",
    valueType: "object",
    updatesValue: "entity_editor_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "entity_editor",
    sortOrder: 100,
  },
  {
    name: "save_entity_draft",
    label: "Save entity draft",
    description:
      "Saves the open entity editor's staged draft through the dialog's own create/update path — equivalent to the user pressing Save/Create, so this IS written to the database immediately. Value is ignored (pass true). Fails when no editor is open or the staged label is empty.",
    valueType: "boolean",
    updatesValue: "entities_detail",
    mode: "entity",
    applyPolicy: "ask",
    group: "entity_editor",
    sortOrder: 110,
  },
  {
    name: "add_entities",
    label: "Add entities",
    description:
      "Creates NEW roster entities on this site through the same canonical create path as the dialog's Create button — written to the database immediately. Value: a non-empty array of objects `{ label, entity_type, description?, reason? }`, where `label` is a non-empty string and `entity_type` is exactly one of: person | source | media | org. Optional `description`/`reason` are stored as the entity's research attributes. APPENDS only — existing entities are never modified or removed; read `entities_detail` first and do not repeat a label already on the roster.",
    valueType: "array",
    updatesValue: "entities_detail",
    mode: "entity",
    applyPolicy: "ask",
    group: "entity_roster",
    sortOrder: 200,
  },
];

export const contentPlanEntitiesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-plan-entities",
  label: "Content Plan Entities",
  readiness: "partial",
  readinessNote:
    "Emitter wired in EntityManager; per-entity attributes not audited field-by-field; entity_curator bound to the Content Plan Entity Curator (manifest + ui.ui_surface_agent_role synced 2026-07-30). Write half live-verified with a real agent run 2026-08-10 (entity_draft / save_entity_draft / add_entities); writeTargets are not yet mirrored to ui.ui_surface_write_target.",
  urlPattern: "/marketing/content-plan/[siteId]?view=entities",
  inheritsFrom: "matrx-user/content-plan",
  intro: `<surface_intro>
You are on the E-E-A-T entity manager of the content plan: the people, sources, media, and organizations behind the site's content (plan.entity rows). The user maintains the roster here; nodes elsewhere attach these entities as author/reviewer/citation via association edges.
Read entities_detail for the full roster and entity_counts_by_type for the shape of it. The inherited plan_tree tells you what content exists — useful for spotting coverage gaps (e.g. medical articles with no reviewer-qualified person registered).
Suggestions belong to the roster: who is missing, whose credentials matter for this vertical, which sources are weak. Node-to-entity attachment happens on the node surfaces, not here.
You can also ACT on the roster: add_entities creates the missing people/sources outright, and entity_draft stages a label/type into the entity dialog the user has open (save_entity_draft saves it). You cannot delete an entity, change its source type, or attach one to a node — those stay with the user or with the node surfaces.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "entity_curator",
      label: "Entity curator",
      description:
        "Builds and audits the site's E-E-A-T roster — proposing the people, sources, and organizations the content needs, and flagging credibility gaps for the vertical.",
      kind: "single",
      // Platform agent "Content Plan Entity Curator" (agx_agent, created via
      // the AI Dream MCP 2026-07-30) — same agent EntityManager's "Suggest
      // from research" button runs (setup/ai.ts).
      defaultAgentId: "c43e4497-3093-4b18-a906-b088127d8b9c",
      sortOrder: 100,
    },
  ],
};

/** Type-safe payload helper — inherited `view` is the only guarantee. */
export function createContentPlanEntitiesScope(values: {
  view: "tree" | "table" | "map" | "entities" | "setup";
  entities_detail?: Array<Record<string, unknown>>;
  entity_counts_by_type?: Record<string, number>;
  entity_editor_draft?: Record<string, unknown>;
  site_id?: string;
  site_domain?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
