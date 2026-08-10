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
    key: "editor_state",
    label: "Entity editor",
    sortOrder: 200,
    description:
      "The New/Edit entity dialog — whether it is open and what is currently typed in it.",
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
    name: "source_type_options",
    label: "Source type options",
    description:
      "The `plan_source_type` categories the editor's Source type picker offers, as {id, name}. THE vocabulary for any source_type_id write — an id absent from this list is refused. Empty while the category dimension loads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 120,
    group: "entity_roster",
    autoContext: false,
  },
  {
    name: "entity_editor",
    label: "Entity editor state",
    description:
      "The New/Edit entity dialog when it is open: {mode: 'new' | 'edit', entity_id (null for a new entity), label, entity_type, source_type_id} reflecting what is TYPED right now, saved or not. Empty when the dialog is closed — the read twin for open_entity_editor and entity_draft.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 200,
    group: "editor_state",
  },
];

/**
 * Write targets — the roster is authored content, so this surface earns them.
 *
 * The judgment call, recorded: an entity's `label` and `entity_type` are
 * exactly the "authored content an agent drafts better/faster" case — naming
 * the cardiologist who should review the site's medical articles, or the
 * standards body worth citing, is the `entity_curator` role's whole job, and
 * the view's existing "Suggest from research" button already performs this
 * write from agent output. `source_type_id` joins them only because
 * `source_type_options` is now declared: an agent that can READ the picker's
 * vocabulary can legitimately choose from it (the reason `content-plan-node`
 * left `node_primary_keyword_id` manual was the absence of exactly that).
 *
 * Deliberately NOT targets:
 *  - DELETING an entity. Destructive and unrecoverable from this UI; the
 *    trash button and its confirm stay human, by doctrine.
 *  - Attaching an entity to a node (author / reviewer / citation edges).
 *    Those are association writes owned by the node surfaces, and claiming
 *    who reviewed a page is an authority claim, not a drafting task.
 *  - Editing an EXISTING entity's `attributes`. The dialog renders no
 *    attributes editor, so a write there would be a one-way door the user
 *    cannot inspect or correct — the `tool_group` lesson. `create_entity`
 *    accepts them only because they are the agent's own provenance note on a
 *    row it is creating, and `entities_detail` reads them straight back.
 *  - Saving the open dialog. Unlike `content-plan-node`'s `save_node`, the
 *    Save button sits directly under the three fields the draft just staged,
 *    in a small modal the user is already looking at — a second confirm to
 *    press it would be ceremony, not consent.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "open_entity_editor",
    label: "Open entity editor",
    description:
      "Opens the entity editor dialog — same as the user clicking a row's pencil, or New entity. Value is an entity UUID from entities_detail to edit that entity, or null to open a blank New entity dialog. UI state only; nothing is written to the plan. Call this before entity_draft, which needs the dialog open.",
    valueType: "string",
    updatesValue: "entity_editor",
    mode: "ui",
    applyPolicy: "auto",
    group: "editor_state",
    sortOrder: 100,
  },
  {
    name: "entity_draft",
    label: "Entity draft",
    description:
      `Stages values into the OPEN entity editor dialog; the user still presses Save/Create and can edit or cancel first. Value is an object with any of: label (the display name, e.g. "Dr. Jane Smith" — a name, not a description), entity_type (one of ${ENTITY_TYPE_LIST}), source_type_id (a category UUID from source_type_options, or null to clear). Keys you omit are left alone; an unrecognised key is refused. Fails if the dialog is closed — open it with open_entity_editor first.`,
    valueType: "object",
    updatesValue: "entity_editor",
    mode: "draft",
    applyPolicy: "ask",
    group: "editor_state",
    sortOrder: 110,
  },
  {
    name: "create_entity",
    label: "Create entity",
    description:
      `Creates ONE new E-E-A-T entity on this site immediately, through the same canonical service the "Suggest from research" button uses — this is saved, not staged, though the user can delete it afterwards. Value is an object: label (required), entity_type (required, one of ${ENTITY_TYPE_LIST}), source_type_id (optional UUID from source_type_options), attributes (optional JSON object — put your reasoning under a "research" key, as {research: {description, reason}}, which is the convention the roster already stores). site and organization come from the open workspace and must not be sent. Use this to build the roster; use entity_draft to change an entity the user already has open.`,
    valueType: "object",
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
    "Emitter wired in EntityManager; per-entity attributes not audited field-by-field; entity_curator bound to the Content Plan Entity Curator (manifest + ui.ui_surface_agent_role synced 2026-07-30). Agent-writable since 2026-08-10 (open_entity_editor / entity_draft / create_entity) — write targets code-only, not yet mirrored to ui.ui_surface_write_target.",
  urlPattern: "/marketing/content-plan/[siteId]?view=entities",
  inheritsFrom: "matrx-user/content-plan",
  intro: `<surface_intro>
You are on the E-E-A-T entity manager of the content plan: the people, sources, media, and organizations behind the site's content (plan.entity rows). The user maintains the roster here; nodes elsewhere attach these entities as author/reviewer/citation via association edges.
Read entities_detail for the full roster and entity_counts_by_type for the shape of it. The inherited plan_tree tells you what content exists — useful for spotting coverage gaps (e.g. medical articles with no reviewer-qualified person registered).
Suggestions belong to the roster: who is missing, whose credentials matter for this vertical, which sources are weak. Node-to-entity attachment happens on the node surfaces, not here.
You can also ACT on the roster. To add a missing entity, call create_entity — it saves one row immediately through the same path the "Suggest from research" button uses. To revise an entity the user already has open, stage into the dialog with entity_draft and let them press Save; open_entity_editor opens that dialog for a given entity (or a blank one) first. source_type_id values must come from source_type_options — never invent a category id. Deleting an entity and attaching entities to nodes are not yours: the first is destructive and stays with the user, the second lives on the node surfaces.
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
  source_type_options?: Array<Record<string, unknown>>;
  entity_editor?: Record<string, unknown>;
  site_id?: string;
  site_domain?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
