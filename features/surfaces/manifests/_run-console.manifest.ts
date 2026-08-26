/**
 * Shared SurfaceValue set for THE RUN CONSOLE — `matrx-admin/marketing-run-console`
 * (system tier) and `matrx-user/marketing-automations` (organization / brand tier).
 *
 * WHY TWO SURFACES FROM ONE VALUE SET (the `_conversation-document` precedent):
 * KI-049 made the permission tier a PROP, not a route fork — "which really
 * should just be one UI, with slightly different permissions." One component,
 * one vocabulary. But the two mounts live in different CLIENTS and govern
 * different blast radii: the admin mount drives every brand on the platform,
 * the user mount drives the brands one organization controls. Different
 * audience, different agents bound — that is exactly what a surface is for.
 * So they share this value set and differ in `surfaceName`, label and intro.
 *
 * WHAT THE CONSOLE IS: an operator picks brands, caps how much one pass may
 * do, presses Run now, and reads back what the engine claimed, placed,
 * proposed, protected and quarantined. The engine is a ROW in
 * `features/marketing/seo/run-console/engines.ts`, so the tab strip grows
 * without a second console — and every value below is engine-agnostic for
 * that reason.
 *
 * THE VALUES ARE EVIDENCE, NOT CONTROLS. Nothing here writes: this surface
 * declares no write targets, because everything a pass does costs money or
 * changes what the platform publishes. An agent bound here reads the run and
 * reasons about it; a person presses Run.
 */

import type {
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const RUN_CONSOLE_GROUPS: SurfaceValueGroup[] = [
  {
    key: "engine",
    label: "Engine",
    sortOrder: 100,
    description:
      "Which coverage engine the operator is driving, and the AI it runs.",
  },
  {
    key: "console_scope",
    label: "Console scope",
    sortOrder: 200,
    description:
      "Which brands this mount governs — the permission tier KI-049 made a prop.",
  },
  {
    key: "brands",
    label: "Brands",
    sortOrder: 300,
    description:
      "The brand list, what is selected to run, and each brand's current coverage.",
  },
  {
    key: "limits",
    label: "Limits & knobs",
    sortOrder: 400,
    description:
      "The admin knobs that bound one pass. A missing knob is a refusal, never a guessed default.",
  },
  {
    key: "run",
    label: "This run",
    sortOrder: 500,
    description:
      "The pass in flight and the outcomes it reported — what was claimed, placed, proposed, protected, quarantined.",
  },
  {
    key: "schedule",
    label: "Schedule",
    sortOrder: 600,
    description:
      "The unattended cascade authored for this engine at this tier.",
  },
];

export const RUN_CONSOLE_VALUES: SurfaceValue[] = [
  // ── Engine ────────────────────────────────────────────────────────────────
  {
    name: "active_engine_slug",
    label: "Active engine",
    description:
      'Slug of the engine tab the operator is on — "seo.topic_placement" or "seo.situational_refresh". Also the `engine_slug` on seo.engine_schedule, so it names the same engine the unattended pass runs. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    group: "engine",
    sortOrder: 100,
  },
  {
    name: "active_engine_label",
    label: "Engine name",
    description:
      'The engine\'s human name as the tab renders it ("Topic placement", "Situational refresh"). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "engine",
    sortOrder: 110,
  },
  {
    name: "active_engine_what",
    label: "What a pass does",
    description:
      "The engine's own one-sentence description of what one pass does, in the operator's language — the line under the console title. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 160,
    group: "engine",
    sortOrder: 120,
  },
  {
    name: "engine_mandate_keys",
    label: "AI running here",
    description:
      'Mandate keys of the agents this engine runs (e.g. ["seo.topic_assigner"]). EMPTY ARRAY for an engine that is pure database work and spends nothing — an empty list means "no AI in this pass", never "unknown". Always present.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "engine",
    sortOrder: 130,
  },
  {
    name: "autonomy_capability",
    label: "Autonomy capability",
    description:
      'The seo.ai_capability slug whose autonomy mode this engine obeys (KI-044) — e.g. "topic_assigner". A pass that writes nothing is usually this mode talking, not an empty queue. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "engine",
    sortOrder: 140,
  },

  // ── Console scope ─────────────────────────────────────────────────────────
  {
    name: "scope_tier",
    label: "Permission tier",
    description:
      '"system" (every brand on the platform), "organization" (the brands one organization controls) or "site" (one brand). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "console_scope",
    sortOrder: 200,
  },
  {
    name: "scope_organization_id",
    label: "Scoped organization",
    description:
      "UUID of the organization this mount governs. Present only on the organization tier.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "console_scope",
    sortOrder: 210,
  },
  {
    name: "scope_site_id",
    label: "Scoped brand",
    description:
      "UUID of the single brand this mount governs. Present only on the site tier.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "console_scope",
    sortOrder: 220,
  },
  {
    name: "request_organization_id",
    label: "Run request organization",
    description:
      "The organization a launched pass travels under — the Matrx System org on the system tier, the scoped org on the organization tier. Absent on the site tier, where the run rides the operator's selected org. Context for the request; engine writes are scoped by the SITE.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "console_scope",
    sortOrder: 230,
  },

  // ── Brands ────────────────────────────────────────────────────────────────
  {
    name: "brand_count",
    label: "Brands in scope",
    description:
      "How many brands the console loaded for this tier. Absent while the brand list is loading or if the read failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "brands",
    sortOrder: 300,
  },
  {
    name: "brand_rows",
    label: "Brand list",
    description:
      "The loaded brands as {id, name, domain} — the rows the table renders. Absent while loading or after a failed read. Bindable rather than auto-context: the list can be long and an agent usually wants the focused brand, not all of them.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "brands",
    sortOrder: 310,
  },
  {
    name: "brands_load_error",
    label: "Brand list error",
    description:
      'Set when the brand read failed and the console shows "Could not read the brand list." Absent when the list loaded.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "brands",
    sortOrder: 320,
  },
  {
    name: "selected_site_ids",
    label: "Selected brands",
    description:
      "UUIDs of the brands ticked for the next run — what Run now would act on. Empty array when nothing is ticked (the Run button is disabled). Always present.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "brands",
    sortOrder: 330,
  },
  {
    name: "focused_site_id",
    label: "Focused brand",
    description:
      "UUID of the brand whose detail the right-hand tabs are showing. Absent until the operator opens a row (or a pass settles, which focuses its brand).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "brands",
    sortOrder: 340,
  },
  {
    name: "focused_site_name",
    label: "Focused brand name",
    description:
      "Display name of the focused brand. Absent when no brand is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "brands",
    sortOrder: 350,
  },
  {
    name: "brand_coverage",
    label: "Coverage by brand",
    description:
      "Per-brand placement standing as the table renders it: {site_id, site_name, clicks_placed_pct, owed}. Read through the same query key as the topics screen — two surfaces, one truth. Absent until at least one coverage query resolves.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "brands",
    sortOrder: 360,
  },
  {
    name: "situational_status",
    label: "Situational standing",
    description:
      "Situational-refresh engine only: per-brand matcher standing {site_id, matchers, stale_matchers, oldest_evaluated_at, stamps, stale_after_hours}. Absent on other engines and until the status read resolves.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "brands",
    sortOrder: 370,
  },

  // ── Limits & knobs ────────────────────────────────────────────────────────
  {
    name: "cap_knob_key",
    label: "Cap knob",
    description:
      'Which admin knob caps ONE pass for this engine ("batch_keywords", "writes_per_pass"). Always present — it is a property of the engine row, not of the load.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 18,
    group: "limits",
    sortOrder: 400,
  },
  {
    name: "cap_ceiling",
    label: "Cap ceiling",
    description:
      "The knob's value — the highest the per-brand cap may be set to. Absent until the knob read resolves. ZERO means the knob row is MISSING: the console refuses to run rather than guess a ceiling.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "limits",
    sortOrder: 410,
  },
  {
    name: "effective_cap",
    label: "Cap for this run",
    description:
      "What the operator actually set in the cap input, clamped between 1 and the ceiling. This is the number a pass will honour. Absent until the knob read resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "limits",
    sortOrder: 420,
  },
  {
    name: "min_impressions",
    label: "Impression floor",
    description:
      "The demand floor a keyword must clear to be considered by this engine, from the knob. Absent until the knob read resolves, and on engines that do not use it.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "limits",
    sortOrder: 430,
  },
  {
    name: "daily_ceiling",
    label: "Daily ceiling",
    description:
      "How many keywords may be placed per brand per DAY across all passes, from the knob. A run can stop early because of this, which is not a failure. Absent until the knob read resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "limits",
    sortOrder: 440,
  },
  {
    name: "knobs_broken",
    label: "Knob row missing",
    description:
      "True when the knob read succeeded but the cap knob has no row — the console is refusing to run and shows the destructive banner. Absent until the knob read resolves.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "limits",
    sortOrder: 450,
  },

  // ── This run ──────────────────────────────────────────────────────────────
  {
    name: "is_running",
    label: "Pass in flight",
    description:
      "True while a pass is streaming or a queue is still draining. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "run",
    sortOrder: 500,
  },
  {
    name: "queue_length",
    label: "Brands queued",
    description:
      "How many selected brands are still waiting to run. The engine is a paid pass, so brands drain ONE at a time — never fanned out. Always present (0 when idle).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    group: "run",
    sortOrder: 510,
  },
  {
    name: "run_stage",
    label: "Current stage",
    description:
      'The human sentence for the stage the live pass is on ("Claiming the highest-demand unplaced keywords…"). Absent when nothing is running.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "run",
    sortOrder: 520,
  },
  {
    name: "run_error",
    label: "Run error",
    description:
      "The error banner's message when the pass itself failed. Absent on a healthy run. A per-brand failure is reported on its outcome instead.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "run",
    sortOrder: 530,
  },
  {
    name: "run_outcome_count",
    label: "Outcomes reported",
    description:
      "How many brand outcomes this console session has collected. Reset when a new run starts. Always present (0 before the first pass settles).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    group: "run",
    sortOrder: 540,
  },
  {
    name: "run_outcomes",
    label: "Run outcomes",
    description:
      "Every settled brand outcome, newest first — claimed / placed / proposed / human_protected / quarantined / returned_to_queue, the daily-ceiling standing, topics created, top phrases, any autonomy refusal, and any error. THE evidence the operator pokes holes in. Empty until the first pass settles.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    autoContext: false,
    group: "run",
    sortOrder: 550,
  },
  {
    name: "run_summary",
    label: "Run summary",
    description:
      "The composite roll-up across every outcome in this session: {brands, claimed, placed, proposed, human_protected, quarantined, errors, ceiling_reached}. Absent before the first pass settles.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "run",
    sortOrder: 560,
  },
  {
    name: "autonomy_refusals",
    label: "Autonomy refusals",
    description:
      'The plain sentences explaining why the engine declined to write on a brand, when its autonomy mode said wait. Empty array when nothing refused. A pass that placed 0 for this reason must never be read as "nothing to place".',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "run",
    sortOrder: 570,
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  {
    name: "engine_schedule_count",
    label: "Schedules authored",
    description:
      "How many unattended schedules exist for this engine across the cascade's tiers. Absent until the schedule read resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "schedule",
    sortOrder: 600,
  },
  {
    name: "engine_schedules",
    label: "Engine schedules",
    description:
      "The seo.engine_schedule rows for this engine — tier, subject, cadence, cap and enabled standing. This is what runs when nobody is watching. Absent until the read resolves.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    group: "schedule",
    sortOrder: 610,
  },
];

/**
 * The values either mount can emit. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true` — the "a UI cannot lie" enforcement.
 *
 * A `type`, not an `interface`: only type aliases get the implicit index
 * signature that lets the payload satisfy `ApplicationScope` without casting.
 */
export type RunConsoleScopeValues = {
  // alwaysAvailable: true → required
  active_engine_slug: string;
  active_engine_label: string;
  active_engine_what: string;
  engine_mandate_keys: string[];
  autonomy_capability: string;
  scope_tier: "system" | "organization" | "site";
  selected_site_ids: string[];
  is_running: boolean;
  queue_length: number;
  run_outcome_count: number;
  cap_knob_key: string;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  scope_organization_id?: string;
  scope_site_id?: string;
  request_organization_id?: string;
  brand_count?: number;
  brand_rows?: Array<{ id: string; name: string; domain: string }>;
  brands_load_error?: string;
  focused_site_id?: string;
  focused_site_name?: string;
  brand_coverage?: Array<Record<string, unknown>>;
  situational_status?: Array<Record<string, unknown>>;
  cap_ceiling?: number;
  effective_cap?: number;
  min_impressions?: number;
  daily_ceiling?: number;
  knobs_broken?: boolean;
  run_stage?: string;
  run_error?: string;
  run_outcomes?: Array<Record<string, unknown>>;
  run_summary?: Record<string, unknown>;
  autonomy_refusals?: string[];
  engine_schedule_count?: number;
  engine_schedules?: Array<Record<string, unknown>>;
};

/** Type-safe payload helper, shared by both mounts. */
export function createRunConsoleScope(
  values: RunConsoleScopeValues,
): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
