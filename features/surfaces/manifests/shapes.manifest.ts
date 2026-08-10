/**
 * Surface manifest — Shape Studio (`matrx-user/shapes`).
 *
 * The user-facing studio over the Shape System — the platform's structured-
 * content registry (`content_ir.kind_definition` + `kind_example` +
 * `kind_instance` + `kind_component`). "Shape" is the product name; **kind**
 * is the technical noun, and `kind` is the slug column agents must use.
 * See `features/content-ir/FEATURE.md` + `docs/SHAPE_SYSTEM.md`.
 *
 * Routes covered (all real, all RLS-scoped with the viewer's JWT — never an
 * admin RPC):
 *   /shapes                    → the list (mine + platform library)
 *   /shapes/[kind]             → Preview: canonical examples through the real
 *                                render route + the owner editor
 *   /shapes/[kind]/schema      → the stored field elements + emitted JSON Schema
 *   /shapes/[kind]/instances   → the viewer's saved `kind_instance` rows
 *   /shapes/[kind]/test        → fill the canonical input form, render live, save
 *   /shapes/instances/[id]     → a pure permalink RESOLVER that redirects to
 *                                `/shapes/[kind]/instances?i=[id]`; it renders
 *                                no UI and therefore emits nothing
 *   /shapes/new                → the create-a-shape handoff into the chat agent
 *
 * DELIBERATELY NOT DECLARED: `content_ir.kind_surface` rows (the XML-tag /
 * fence-language detection registry). No /shapes route loads them, and the
 * platform's rule is that a surface never declares what nothing emits. The
 * component side IS represented, but only as far as the studio actually reads
 * it: `activation_component_platforms` from the activation verdict and the
 * per-row `hasComponent` flag inside the catalog lists — not raw
 * `kind_component` rows.
 *
 * Runtime emitters (each mounts its own `<SurfaceRuntimeProvider
 * surfaceName="matrx-user/shapes">` and builds scope at trigger time):
 *   - ShapesListClient.tsx      → catalog values, studio_tab "list"
 *   - ShapePreviewTab.tsx       → the Preview route in full: kind identity,
 *                                 schema, samples, and (owner only) the
 *                                 activation verdict
 *   - ShapeSurfaceRuntime.tsx   → the thin server-loaded shell wrapping the
 *                                 Schema, Instances, and Test ROUTES with kind
 *                                 identity + schema. On Instances and Test the
 *                                 tab below it nests DEEPER and wins.
 *   - ShapeInstancesTab.tsx     → kind identity + instances + focused instance
 *   - ShapeTestTab.tsx          → kind identity + the live draft + save state
 *   - NewShapeClient.tsx        → the draft intent/sample, studio_tab "new"
 *
 * Nothing is `alwaysAvailable`: the list, detail, and create routes emit
 * disjoint sets, so a guarantee would be a lie on at least one of them.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "kind_identity",
    label: "Kind identity",
    sortOrder: 100,
    description:
      "Which kind (shape) the user has open, and its ownership / visibility / version standing.",
  },
  {
    key: "kind_schema",
    label: "Kind schema",
    sortOrder: 200,
    description:
      "The kind's structure: the authored field elements and the materialized JSON Schema both runtimes validate against.",
  },
  {
    key: "kind_activation",
    label: "Activation gate",
    sortOrder: 300,
    description:
      "The dual gate that decides `is_active`: the structural leg (canonical sample validates) and the render leg (sample lights up a real component).",
  },
  {
    key: "kind_samples",
    label: "Samples",
    sortOrder: 400,
    description:
      "The kind's `kind_example` rows — version-bound samples, one of which may be canonical.",
  },
  {
    key: "kind_instances",
    label: "Instances",
    sortOrder: 500,
    description:
      "The viewer's own saved `kind_instance` rows for this kind, and the one they have focused.",
  },
  {
    key: "studio_state",
    label: "Studio state",
    sortOrder: 600,
    description:
      "Where the user is in the studio and what they are currently composing in the Test tab.",
  },
  {
    key: "shape_catalog",
    label: "Shape catalog",
    sortOrder: 700,
    description:
      "The /shapes list view: the viewer's own shapes and the platform library.",
  },
  {
    key: "shape_draft",
    label: "New-shape draft",
    sortOrder: 800,
    description:
      "The /shapes/new composer that hands an intent + sample to the shape-creator agent.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ---------------------------------------------------------------- identity
  {
    name: "kind_slug",
    label: "Kind slug",
    description:
      "The canonical `content_ir.kind_definition.kind` slug of the shape the user has open — the token every Shape System tool and `__kind` payload uses. Empty on the list and create routes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "kind_identity",
    sortOrder: 100,
  },
  {
    name: "kind_label",
    label: "Kind label",
    description:
      "Human display name of the open shape. Empty when no shape is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "kind_identity",
    sortOrder: 110,
  },
  {
    name: "kind_definition_id",
    label: "Kind definition ID",
    description:
      "UUID of the `content_ir.kind_definition` row — the write target for examples and instances. Empty when no shape is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "kind_identity",
    sortOrder: 120,
  },
  {
    name: "kind_version",
    label: "Kind version",
    description:
      "Current version of the definition, bumped on every update including activation flips. Instances are pinned to the version they were saved at. Absent when no shape is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "kind_identity",
    sortOrder: 130,
  },
  {
    name: "kind_visibility",
    label: "Kind visibility",
    description:
      "`internal` or `public` — shapes may never be `personal` (rejected by a DB check). Empty when no shape is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "kind_identity",
    sortOrder: 140,
  },
  {
    name: "kind_is_active",
    label: "Kind is active",
    description:
      "Whether the kind currently passes the dual gate and is bindable as an agent's structured output. Absent when no shape is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_identity",
    sortOrder: 150,
  },
  {
    name: "kind_title_key",
    label: "Instance title key",
    description:
      "The `metadata.title_key` field used to derive an instance's display title from its payload. Empty when the kind uses the default title derivation.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "kind_identity",
    sortOrder: 170,
  },
  {
    name: "kind_loading_component",
    label: "Loading component",
    description:
      "The `metadata.loading_component` shown while a streaming instance of this kind is still arriving. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "kind_identity",
    sortOrder: 180,
  },
  {
    name: "kind_owned_by_viewer",
    label: "Owned by viewer",
    description:
      "True when the current user created this kind and therefore sees the owner editor (label, visibility, examples, activation). Absent when no shape is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_identity",
    sortOrder: 190,
  },
  {
    name: "kind_updated_at",
    label: "Kind last updated",
    description:
      "ISO timestamp of the definition's last update. Empty when no shape is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "kind_identity",
    sortOrder: 195,
  },

  // ------------------------------------------------------------------ schema
  {
    name: "kind_field_data",
    label: "Authored field elements",
    description:
      "The ordered `StoredFieldElement[]` in `kind_definition.data` — the authored structure for TS-owned kinds. Null for Python-owned kinds, which only carry the emitted schema. Large — bindable only.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    group: "kind_schema",
    sortOrder: 200,
  },
  {
    name: "kind_emitted_json_schema",
    label: "Emitted JSON Schema",
    description:
      "The materialized JSON Schema both runtimes validate payloads against — the authority for whether an instance is valid. Large — bindable only. Empty when no shape is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "kind_schema",
    sortOrder: 210,
  },

  // -------------------------------------------------------------- activation
  {
    name: "activation_would_activate",
    label: "Would activate",
    description:
      "The gate's verdict: true when both legs pass and the kind can be activated. Absent until the verdict loads (owner view only).",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_activation",
    sortOrder: 300,
  },
  {
    name: "activation_structural_ok",
    label: "Structural leg passes",
    description:
      "True when the canonical sample validates against the emitted JSON Schema. Absent until the verdict loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_activation",
    sortOrder: 310,
  },
  {
    name: "activation_render_ok",
    label: "Render leg passes",
    description:
      "True when the canonical sample lights up a real component (bundled bridge or an active output `kind_component`). Absent until the verdict loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_activation",
    sortOrder: 320,
  },
  {
    name: "activation_render_leg_applicable",
    label: "Render leg applicable",
    description:
      "False for data-only generated contract families, where the render leg does not apply. Absent until the verdict loads.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_activation",
    sortOrder: 330,
  },
  {
    name: "activation_component_platforms",
    label: "Component platforms",
    description:
      'Platforms that have an active output component bound to this kind (e.g. ["web"]). Empty array when none is bound.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "kind_activation",
    sortOrder: 340,
  },
  {
    name: "activation_reasons",
    label: "Activation blockers",
    description:
      "Human-readable reasons the kind cannot activate. Empty array when the gate passes.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "kind_activation",
    sortOrder: 350,
  },
  {
    name: "kind_activation",
    label: "Activation verdict",
    description:
      "Composite of the whole dual-gate verdict (both legs, applicability, component platforms, blockers, currently-active). Empty until the verdict loads or when the viewer is not the owner.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "kind_activation",
    sortOrder: 360,
  },

  // ----------------------------------------------------------------- samples
  {
    name: "kind_examples",
    label: "Kind samples",
    description:
      "The `content_ir.kind_example` rows for this kind (label, description, canonical flag, source, validation status, pinned version, payload), canonical first. Large — bindable only. Empty when the kind has no samples.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "kind_samples",
    sortOrder: 400,
  },
  {
    name: "kind_example_count",
    label: "Sample count",
    description:
      "How many samples exist for this kind. Zero when none have been authored or captured.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "kind_samples",
    sortOrder: 410,
  },
  {
    name: "canonical_example_present",
    label: "Canonical sample present",
    description:
      "True when one of the samples is marked canonical — the sample the activation gate tests against. Absent before the samples load.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "kind_samples",
    sortOrder: 420,
  },

  // --------------------------------------------------------------- instances
  {
    name: "kind_instances",
    label: "My instances",
    description:
      "The viewer's own live `kind_instance` rows for this kind, newest first, each with its title, pinned version, validation status and payload. Large — bindable only. Empty on every route except the Instances tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "kind_instances",
    sortOrder: 500,
  },
  {
    name: "kind_instance_count",
    label: "Instance count",
    description:
      "How many of the viewer's instances exist for this kind. Zero when they have saved none.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "kind_instances",
    sortOrder: 510,
  },
  {
    name: "focused_instance_id",
    label: "Focused instance ID",
    description:
      "UUID of the instance the user has opened (from the `?i=` deep link or a row click). Empty when no instance is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "kind_instances",
    sortOrder: 520,
  },
  {
    name: "focused_instance",
    label: "Focused instance",
    description:
      "The opened instance in full: title, pinned kind version, validation status and its pure payload (no `__kind` wrapper). Bindable only. Empty when no instance is focused.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "kind_instances",
    sortOrder: 530,
  },

  // ------------------------------------------------------------ studio state
  {
    name: "studio_tab",
    label: "Active studio tab",
    description:
      "Where the user is: `list`, `preview`, `schema`, `instances`, `test`, or `new`. Always emitted by every studio route's emitter.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "studio_state",
    sortOrder: 600,
  },
  {
    name: "test_draft_instance",
    label: "Test draft payload",
    description:
      "The payload the user is currently composing in the Test tab's input form, before saving. Bindable only. Empty when the form is untouched or off the Test tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "studio_state",
    sortOrder: 610,
  },
  {
    name: "test_save_state",
    label: "Test save state",
    description:
      "The Test tab's save outcome: idle / saving / saved (with the new instance id and pinned version) / validator-drift / error. Empty off the Test tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    group: "studio_state",
    sortOrder: 620,
  },

  // ----------------------------------------------------------------- catalog
  {
    name: "shape_count",
    label: "Visible shape count",
    description:
      "How many shapes the list is showing after the search filter. Zero when nothing matches; absent off the list route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "shape_catalog",
    sortOrder: 700,
  },
  {
    name: "my_shapes",
    label: "My shapes",
    description:
      "The list rows created by the current user (kind slug, label, active flag, visibility, family, version, has-component). Bindable only. Empty off the list route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "shape_catalog",
    sortOrder: 710,
  },
  {
    name: "platform_shapes",
    label: "Platform shapes",
    description:
      "The RLS-visible library rows the current user did NOT create — platform/system kinds and granted rows. Bindable only. Empty off the list route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "shape_catalog",
    sortOrder: 720,
  },
  {
    name: "shape_search_query",
    label: "Catalog search",
    description:
      "Free-text filter the user typed over the shape list (matches label, slug, or id). Empty when unfiltered.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "shape_catalog",
    sortOrder: 730,
  },

  // ------------------------------------------------------------------- draft
  {
    name: "new_shape_intent",
    label: "New-shape intent",
    description:
      "What the user typed describing the shape they want to create on /shapes/new. Empty when they have not typed anything.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "shape_draft",
    sortOrder: 800,
  },
  {
    name: "new_shape_sample",
    label: "New-shape sample",
    description:
      "The example payload the user pasted on /shapes/new to seed the shape's structure. Bindable only. Empty when none was pasted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    group: "shape_draft",
    sortOrder: 810,
  },
  {
    name: "shape_creator_agent_id",
    label: "Shape creator agent",
    description:
      "UUID of the configured agent the /shapes/new draft is handed to. Empty when the creator agent is not configured (the page shows a loud not-configured card).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "shape_draft",
    sortOrder: 820,
  },
];

/**
 * The WRITE half — what an agent may drive in the Shape Studio, and (just as
 * deliberately) what it may not.
 *
 * SIX components mount this surface, and the split between them is the whole
 * design. `listAgentWritableTargets()` only offers a target where THAT mount
 * registered a handler, so the same manifest list produces a different offer
 * per route. Who registers what:
 *
 *   NewShapeClient        → new_shape_intent, new_shape_sample
 *   ShapeOwnerEditor      → shape_details_{label,title_key,loading_component}
 *     (registered by NAME from inside ShapePreviewTab's provider, because the
 *      owner editor is the deep child that owns that draft state — and it
 *      renders ONLY for the kind's owner, so a non-owner is offered nothing)
 *   ShapeTestTab          → test_draft_instance
 *   ShapesListClient      → NOTHING. Its only page state is the catalog search
 *                           filter: a mechanical view control, not content an
 *                           agent produces. Filtering a list the agent can
 *                           already READ in full (my_shapes / platform_shapes)
 *                           buys nothing.
 *   ShapeInstancesTab     → NOTHING. Its state is instance selection, an
 *                           edit-mode flag, DELETE, and re-pin-to-current-
 *                           version. Selection is navigation, delete is
 *                           destructive, and a re-pin is a version operation —
 *                           none of them clear the bar.
 *   ShapeSurfaceRuntime   → NOTHING. It is the read-only route shell. It is
 *                           the ONLY provider on the Schema route, which
 *                           renders no editor at all; on Instances and Test
 *                           the tab nested inside it is what registers.
 *
 * Every target is `mode: "draft"` and `applyPolicy: "ask"`. Nothing here
 * persists on its own: the agent stages a value into the exact state the
 * user's own typing feeds, and the user still presses the page's Save /
 * Render / Start button. That is the whole safety story, and it is why NONE
 * of these needed an entity path.
 *
 * Ruled out ON PURPOSE, so the next agent does not "helpfully" add them:
 *   - `kind` (the SLUG) — identity. Renaming an existing kind's slug breaks
 *     every `__kind` payload, instance, and tool call that references it.
 *   - `kind_visibility` — internal → public PUBLISHES the shape into the
 *     shared library. A human decides that.
 *   - activation (`is_active`) — a VERDICT from the dual gate, not a field.
 *   - example / instance CRUD and re-pinning — these bump the definition
 *     version and re-validate every sample; not an agent's call.
 */
const writeTargets: SurfaceWriteTarget[] = [
  // ------------------------------------------------- /shapes/new composer
  {
    name: "new_shape_intent",
    label: "New-shape intent",
    description:
      "Stages the 'What do you want to build?' prose on /shapes/new — the description of the shape to create. Plain string, 1-4000 characters; REPLACES the whole field, so read the new_shape_intent value first if you mean to extend what the user already typed. Nothing is created by this write: the text lands in the textarea and the user still presses 'Start with the agent', which hands the composed brief to the shape-creator agent. Write it as a description of the DATA and what it should look like rendered (fields, types, and how the user wants to see it) — not as an instruction to a person.",
    valueType: "string",
    updatesValue: "new_shape_intent",
    mode: "draft",
    applyPolicy: "ask",
    group: "shape_draft",
    sortOrder: 800,
  },
  {
    name: "new_shape_sample",
    label: "New-shape sample",
    description:
      "Stages the optional 'Sample data' example on /shapes/new that the creator agent designs the shape's structure around. For a JSON sample pass the OBJECT OR ARRAY ITSELF — it is written into the box as pretty-printed JSON; never hand-encode it into a quoted string, which lands as escaped \\n and stray quotes. For CSV or plain text pass a plain string. Either way REPLACES the whole field, max 20000 characters rendered, and no markdown fences. Nothing is created by this write: the user still presses 'Start with the agent'.",
    valueType: "string",
    updatesValue: "new_shape_sample",
    mode: "draft",
    applyPolicy: "ask",
    group: "shape_draft",
    sortOrder: 810,
  },

  // ---------------------------------- /shapes/[kind] owner editor → Details
  {
    name: "shape_details_label",
    label: "Shape display name",
    description:
      "Stages a new DISPLAY NAME into the owner editor's Details tab on /shapes/[kind]. Plain string, 1-100 characters. This is the human-readable label only — the technical `kind` slug is identity and is NOT writable, so the shape keeps the same slug everywhere. Offered only to the shape's owner, and only staged: the user still presses 'Save details' (which bumps the definition version and re-pins its samples).",
    valueType: "string",
    updatesValue: "kind_label",
    mode: "draft",
    applyPolicy: "ask",
    group: "kind_identity",
    sortOrder: 160,
  },
  {
    name: "shape_details_title_key",
    label: "Instance title field",
    description:
      "Stages the `metadata.title_key` choice into the owner editor's Details tab — the top-level payload field used to name saved instances when the user gives no title. Must be a TOP-LEVEL property name of this kind's emitted JSON Schema (read kind_emitted_json_schema and pick a short human-readable string field such as a title or name), or the empty string \"\" to fall back to automatic derivation. Any other value is rejected. Staged only: the user still presses 'Save details'.",
    valueType: "string",
    updatesValue: "kind_title_key",
    mode: "draft",
    applyPolicy: "ask",
    group: "kind_identity",
    sortOrder: 175,
  },
  {
    name: "shape_details_loading_component",
    label: "Streaming loader",
    description:
      "Stages the skeleton shown while an instance of this shape is still streaming. Must be one slug from the platform's loading registry — pick the one whose layout matches how this shape renders (e.g. a card-shaped shape takes the card loader, a tabular one the table loader) — or the empty string \"\" for the generic loader. The handler rejects any slug that is not registered and names the accepted set in its error. Staged only: the user still presses 'Save details'.",
    valueType: "string",
    updatesValue: "kind_loading_component",
    mode: "draft",
    applyPolicy: "ask",
    group: "kind_identity",
    sortOrder: 185,
  },

  // ------------------------------------------- /shapes/[kind]/test composer
  {
    name: "test_draft_instance",
    label: "Test draft payload",
    description:
      "Seeds the Test tab's input form with a sample payload for this shape. Pass a JSON OBJECT of the shape's own fields — the `__kind` discriminator is added for you, so do not include it. Build it against kind_emitted_json_schema, which is the authority on what is valid; unknown or malformed fields are simply not accepted by the form. This only FILLS the form: the user reviews the fields, presses Render to validate and see it draw through the real component, and presses Save if they want to keep the instance. Replaces whatever is currently in the form.",
    valueType: "object",
    updatesValue: "test_draft_instance",
    mode: "draft",
    applyPolicy: "ask",
    group: "studio_state",
    sortOrder: 615,
  },
];

export const shapesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/shapes",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters are wired on the list, preview/schema, instances, test, and new routes, but the surface has not been live-verified with a non-matching-name binding, no `data-surface-value` anchors are tagged for Locate, and `kind_surface` (detection) rows are intentionally undeclared because no /shapes route loads them.",
  label: "Shape Studio",
  urlPattern: "/shapes",
  intro: `<surface_intro>
You are in the Shape Studio — the user-facing registry of the Matrx Shape System. A "shape" is the product word; the technical noun is a KIND, and its slug (kind_slug) is the token that every \`__kind\` payload and every Shape System tool uses. Always refer to a shape by its slug when acting on it.
WHICH VALUES EXIST DEPENDS ON THE ROUTE — nothing here is guaranteed, so check for emptiness before reasoning:
  - /shapes (studio_tab "list") — shape_count, my_shapes, platform_shapes, shape_search_query. NO kind-detail values.
  - /shapes/[kind] and /shapes/[kind]/schema (studio_tab "preview" / "schema") — the full kind identity, kind_field_data and kind_emitted_json_schema, the samples (kind_examples, counts, canonical flag) and, for the owner, the activation verdict.
  - /shapes/[kind]/instances (studio_tab "instances") — kind identity plus kind_instances, kind_instance_count, and the focused instance. The schema and activation values are NOT emitted here.
  - /shapes/[kind]/test (studio_tab "test") — kind identity plus test_draft_instance and test_save_state. The schema, samples, and activation values are NOT emitted here.
  - /shapes/new (studio_tab "new") — only new_shape_intent, new_shape_sample, shape_creator_agent_id.
  - /shapes/instances/[id] is a permalink resolver that redirects; it renders nothing and emits nothing.
Three things to get right. First, the emitted JSON Schema is the AUTHORITY on validity — validate any payload you propose against it rather than inferring structure from a sample. Second, \`is_active\` is a VERDICT from a dual gate, not a flag you may recommend flipping casually: both the structural leg (the canonical sample validates) and the render leg (that sample lights up a real component) must pass, and activation_reasons tells you exactly what is blocking. Third, instances store the PURE payload with the \`__kind\` wrapper stripped, pinned to the kind version they were saved at — a pinned version older than kind_version means the instance may not satisfy the current schema.
Detection rows (which XML tag or fence language maps to this kind) are deliberately not part of this surface — no studio route loads them, so never claim a kind is or is not detected from what you see here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Typed scope builder — "a UI cannot lie". Every key is optional: the list,
 * detail-tab, and create routes on this surface emit disjoint sets, so no
 * value is guaranteed on every launch.
 */
export function createShapesScope(values: {
  // identity
  kind_slug?: string;
  kind_label?: string;
  kind_definition_id?: string;
  kind_version?: number;
  kind_visibility?: string;
  kind_is_active?: boolean;
  kind_title_key?: string;
  kind_loading_component?: string;
  kind_owned_by_viewer?: boolean;
  kind_updated_at?: string;
  // schema
  kind_field_data?: unknown[];
  kind_emitted_json_schema?: Record<string, unknown>;
  // activation
  activation_would_activate?: boolean;
  activation_structural_ok?: boolean;
  activation_render_ok?: boolean;
  activation_render_leg_applicable?: boolean;
  activation_component_platforms?: string[];
  activation_reasons?: string[];
  kind_activation?: Record<string, unknown>;
  // samples
  kind_examples?: Array<Record<string, unknown>>;
  kind_example_count?: number;
  canonical_example_present?: boolean;
  // instances
  kind_instances?: Array<Record<string, unknown>>;
  kind_instance_count?: number;
  focused_instance_id?: string;
  focused_instance?: Record<string, unknown>;
  // studio state
  studio_tab?: string;
  test_draft_instance?: Record<string, unknown>;
  test_save_state?: Record<string, unknown>;
  // catalog
  shape_count?: number;
  my_shapes?: Array<Record<string, unknown>>;
  platform_shapes?: Array<Record<string, unknown>>;
  shape_search_query?: string;
  // draft
  new_shape_intent?: string;
  new_shape_sample?: string;
  shape_creator_agent_id?: string;
  // baselines
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
