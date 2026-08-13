/**
 * Surface manifest — Kind Registry Admin (`matrx-admin/kind-registry`).
 *
 * ADMIN SURFACE. Drives `/administration/utilities/kind-registry/**` — the
 * Shape System admin console over `content_ir.kind_definition` /
 * `kind_surface` / `kind_component` / `kind_example` (see
 * `features/content-ir/FEATURE.md`). Three sub-routes:
 *
 *   /administration/utilities/kind-registry          catalog (list + status board + export)
 *   /administration/utilities/kind-registry/[kind]    one kind's detail (schema, examples, assets)
 *   /administration/utilities/kind-registry/build      agent-assisted kind builder (compose a prompt for kind_architect)
 *
 * What an agent bound here may safely do: read whichever child's state is
 * populated (per `kind_registry_section`) and help draft, explain, or debug
 * — e.g. "why is this kind's component leg red", "turn this pasted JSON
 * into kind_builder_structure", "summarize what's wired for this kind".
 *
 * Emitter (real, wired):
 *   - Kind builder → `features/content-ir/admin/KindBuilderClient.tsx`
 *     (the most agent-relevant page: it composes the exact prompt handed to
 *     the kind_architect agent, so an agent bound here can draft/refine the
 *     structure and direction text before the human presses "Start").
 *
 * NOT wired (readiness: partial): the catalog table and the per-kind detail
 * page are both real, live-fetched data (`buildKindStatusBoard`,
 * `gatherKindDetail`) but their emitters are left for a follow-up pass —
 * the catalog has its own facet/column-filter state inside `MatrxDataTable`
 * and the detail page has 7 tabs each with their own sub-component.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_KIND_REGISTRY_SURFACE_NAME = "matrx-admin/kind-registry";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Kind registry navigation",
    sortOrder: 100,
    description: "Which sub-route of the kind registry admin is active.",
  },
  {
    key: "catalog",
    label: "Kind catalog",
    sortOrder: 200,
    description:
      "The list of every declared kind and its per-asset status (definition, example, gate, component, skill, content_block, surface).",
  },
  {
    key: "kind_detail",
    label: "Kind detail",
    sortOrder: 300,
    description:
      "One kind's full record: schema, examples, components, surfaces, skills, and doctor status, on the [kind] detail page.",
  },
  {
    key: "kind_builder",
    label: "Kind builder",
    sortOrder: 400,
    description:
      "The agent-assisted kind builder: the pasted data structure and direction notes an admin composes before handing off to the kind_architect agent.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "kind_registry_section",
    label: "Kind registry section",
    description:
      'Which sub-route is active: "catalog" (list/board/export), "detail" (one kind\'s [kind] page), or "build" (the agent-assisted builder). Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "navigation",
  },

  // ── Catalog ──────────────────────────────────────────────────────────
  {
    name: "catalog_tab",
    label: "Catalog tab",
    description:
      'Which of the three catalog-page tabs is active: "catalog" (table), "board" (status board), or "export" (schema/reference-graph explorer). Present only on kind_registry_section=catalog.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 200,
    group: "catalog",
  },
  {
    name: "kind_catalog_rows",
    label: "Kind catalog rows",
    description:
      "Every declared kind (kind, label, family, isActive, version, visibility, componentCount, surfaceCount, exampleCount, and per-asset-column status cells: definition/example/gate_structural/component/skill/content_block/surface). Present only on kind_registry_section=catalog.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    sortOrder: 210,
    group: "catalog",
  },
  {
    name: "kind_catalog_totals",
    label: "Kind catalog totals",
    description:
      "Header summary counts: total kinds, active count, red findings count, yellow findings count, drifted-row count (live DB vs committed snapshot). Present only on kind_registry_section=catalog.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 220,
    group: "catalog",
  },
  {
    name: "kind_catalog_facets",
    label: "Kind catalog facets",
    description:
      'Table facet filters: { activeFacet: "all"|"on"|"off", issueFacet: "all"|"red"|"drift" }. Present only when catalog_tab is "catalog".',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 230,
    group: "catalog",
  },

  // ── Kind detail ──────────────────────────────────────────────────────
  {
    name: "current_kind",
    label: "Active kind",
    description:
      "The kind slug (content_ir.kind_definition.kind, e.g. \"topic_ideas\") shown on the [kind] detail page — this is a slug, not a UUID. Present only on kind_registry_section=detail.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 300,
    group: "kind_detail",
  },
  {
    name: "kind_detail_tab",
    label: "Kind detail tab",
    description:
      'Which of the 7 detail tabs is active: "preview", "examples", "assets", "try-input", "gate", "schema", or "inputs". Present only on kind_registry_section=detail.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 305,
    group: "kind_detail",
  },
  {
    name: "kind_detail_summary",
    label: "Kind detail summary",
    description:
      "Header fields for current_kind: { id, kind, label, isActive, version, visibility, updatedAt }. Present only on kind_registry_section=detail.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 310,
    group: "kind_detail",
  },
  {
    name: "kind_detail_schema",
    label: "Kind detail schema",
    description:
      "The kind's field data and emitted JSON Schema: { fieldData, emittedJsonSchema }. Shown on the Schema tab. Present only on kind_registry_section=detail; either half may be null if not yet defined.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 315,
    group: "kind_detail",
  },
  {
    name: "kind_detail_doctor_row",
    label: "Kind detail doctor status",
    description:
      "Per-asset-column status (definition/example/gate_structural/component/skill/content_block/surface) for current_kind, same shape as one kind_catalog_rows entry. Present only on kind_registry_section=detail.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 320,
    group: "kind_detail",
  },
  {
    name: "kind_detail_components",
    label: "Kind detail components",
    description:
      "kind_component rows for current_kind (id, platform, role, componentKey, source, isActive, isDefault). Present only on kind_registry_section=detail; empty array if none are registered.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 325,
    group: "kind_detail",
  },
  {
    name: "kind_detail_surfaces",
    label: "Kind detail surfaces",
    description:
      "kind_surface rows for current_kind (id, surfaceType, token, parserStrategy, streaming, isActive). Present only on kind_registry_section=detail; empty array if none are registered.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 330,
    group: "kind_detail",
  },
  {
    name: "kind_detail_skills",
    label: "Kind detail skills",
    description:
      "Skills that teach current_kind (skill teaching summaries). Present only on kind_registry_section=detail; empty array if none teach this kind.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 335,
    group: "kind_detail",
  },
  {
    name: "kind_detail_examples",
    label: "Kind detail examples",
    description:
      "kind_example rows for current_kind (id, label, description, is_canonical, source, validation_status, kind_version, updated_at) — the Examples tab. Present only on kind_registry_section=detail; empty array before the first example is added.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 340,
    group: "kind_detail",
  },
  {
    name: "kind_detail_canonical_example_data",
    label: "Kind detail canonical example data",
    description:
      "The `data` payload of current_kind's canonical example (falls back to the newest example when none is marked canonical). Used by the Preview tab. Absent when no examples exist yet.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 345,
    group: "kind_detail",
  },

  // ── Kind builder ─────────────────────────────────────────────────────
  {
    name: "kind_builder_structure",
    label: "Kind builder structure",
    description:
      "The raw data structure the admin pasted into the builder (JSON, a row sample, or a free-text field list) — becomes the core of the kind_architect prompt. Empty string before anything is typed. Present only on kind_registry_section=build.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 400,
    group: "kind_builder",
  },
  {
    name: "kind_builder_notes",
    label: "Kind builder direction notes",
    description:
      "Optional free-text notes on style, interaction, or agent-trigger behavior the admin wants baked into the new kind. Empty string when unset. Present only on kind_registry_section=build.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 410,
    group: "kind_builder",
  },
  {
    name: "kind_builder_architect_agent_id",
    label: "Kind architect agent ID",
    description:
      "The resolved agent id for the content_ir.kind_architect slot that will run when the admin presses Start. Absent when the slot fails to resolve.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "kind_builder",
  },
  {
    name: "kind_builder_can_start",
    label: "Kind builder can start",
    description:
      "True when kind_builder_structure is non-empty AND the architect agent slot resolved — mirrors the page's own Start-button enablement. Present only on kind_registry_section=build.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 430,
    group: "kind_builder",
  },
];

export const adminKindRegistryManifest: SurfaceManifest = {
  surfaceName: ADMIN_KIND_REGISTRY_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Kind builder emitter is wired and real (structure/notes/architect resolution/can-start). The catalog table and per-kind [kind] detail page are real, live-fetched data with no emitter yet — both have significant internal state (MatrxDataTable facets/column filters; 7 detail tabs each with their own sub-component) left for a follow-up pass.",
  label: "Kind Registry Admin",
  urlPattern: "/administration/utilities/kind-registry",
  intro: `<surface_intro>
This is an ADMIN surface: the Shape System console at /administration/utilities/kind-registry, over content_ir.kind_definition / kind_surface / kind_component / kind_example.

kind_registry_section tells you which sub-route is active: "catalog" (the full list of kinds with per-asset status — catalog_tab picks table/board/export), "detail" (current_kind's schema, examples, components, surfaces, skills, doctor status — kind_detail_tab picks which tab), or "build" (a blank composer where the admin pastes a data structure plus optional direction notes, which become the prompt handed to the kind_architect agent).

On the builder, you may draft or refine kind_builder_structure and kind_builder_notes directly — that IS the intended workflow (an agent helping shape the prompt before the human presses Start). Nothing here executes automatically: the kind_architect agent run itself is a separate floating window the admin opens by pressing Start, not something you trigger.

Only the values matching the current kind_registry_section are populated — everything else is absent, not stale.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminKindRegistryScope(values: {
  // alwaysAvailable: true → required
  kind_registry_section: "catalog" | "detail" | "build";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  catalog_tab?: "catalog" | "board" | "export";
  kind_catalog_rows?: unknown[];
  kind_catalog_totals?: Record<string, unknown>;
  kind_catalog_facets?: Record<string, unknown>;
  current_kind?: string;
  kind_detail_tab?:
    | "preview"
    | "examples"
    | "assets"
    | "try-input"
    | "gate"
    | "schema"
    | "inputs";
  kind_detail_summary?: Record<string, unknown>;
  kind_detail_schema?: Record<string, unknown>;
  kind_detail_doctor_row?: Record<string, unknown>;
  kind_detail_components?: unknown[];
  kind_detail_surfaces?: unknown[];
  kind_detail_skills?: unknown[];
  kind_detail_examples?: unknown[];
  kind_detail_canonical_example_data?: Record<string, unknown>;
  kind_builder_structure?: string;
  kind_builder_notes?: string;
  kind_builder_architect_agent_id?: string;
  kind_builder_can_start?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
