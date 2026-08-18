/**
 * Surface manifest — Mandates admin (`matrx-admin/mandates`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/mandates` — the console over
 * every DB-managed mandate (`agent.mandate` / `agent.mandate_binding`):
 * current pin (vs latest), health, enable/disable, rebind, per-principal
 * overrides, and the exemplar test bench. Backed by
 * `features/admin/mandates/MandatesConsole.tsx`; cross-repo
 * system-of-record: common-docs/systems/mandates/FEATURE.md.
 *
 * What an agent bound here may safely do: read the mandate list, the health
 * roll-up, and the selected mandate's pin state, then help the admin reason
 * about drift ("v7 is latest"), THE SYSTEM-AGENT LAW violations ("not a
 * system agent"), or draft a label/description. It must NEVER assume a
 * rebind, enable/disable, or test run has happened — those are the admin's
 * own actions.
 *
 * Emitter: `MandatesConsole` mounts `<SurfaceRuntimeProvider>` and builds
 * the scope at Run time via `createMandatesScope`.
 *
 * ── THE JUDGMENT BAR ON THIS SURFACE (read before adding a target) ──────
 * Almost everything this console shows is OBSERVED OPERATIONAL EVIDENCE, and
 * evidence is never agent-writable. `mandate_count`, `mandates_summary`,
 * `health_summary`, `unhealthy_mandates`, `system_agent_count` and
 * `selected_mandate_health` are MEASURED from the live `agent.mandate` /
 * `agent.mandate_binding` rows and the canonical agent slice — health in
 * particular is computed, not authored, so an agent writing it would be
 * fabricating the state of the system. That is the same line
 * `education-grade-work` drew around grader output and `transcripts-cleanup`
 * drew around `raw_transcript_text`.
 *
 * The console's own controls fail the bar for their own reasons, all of them
 * deliberate:
 *  - **Rebind** (`MandateEditor` — agent, track-latest, pinned version). WHICH
 *    agent occupies a mandate is identity by UUID, and changing it changes what
 *    runs for every user the mandate serves. The agent catalog behind the picker
 *    (`selectBuiltinAgents`) is not a surface value — only its COUNT is — so
 *    an agent writing it would be guessing a UUID. This is exactly why
 *    `agent_id` was deferred on `matrx-user/pdf-extractor`.
 *  - **Enable / disable a mandate** and the bench's **Run all**. Both touch live
 *    production capacity or spend real model budget across every exemplar.
 *    The settled precedent across this campaign (`marketing-crawls` Start
 *    crawl, `pdf-extractor` Run) is that spending real resources stays behind
 *    a human press.
 *  - **Per-principal overrides** (`MandateOverrideEditor` — the tempting
 *    `selected_mandate_overrides` candidate). On inspection it holds three
 *    fields and none of them earns a target: the agent swap is identity by
 *    UUID again; `model` is an id from a catalog this surface does not
 *    expose, so it could only be guessed; and `thinking_level` alone is a
 *    single mechanical toggle — the "pure-mechanical toggle nobody would ask
 *    an agent to flip" the bar rejects. It is also governance: a binding
 *    changes which agent runs a platform step for a user or a whole org.
 *  - **Owner verdict notes** on bench results. That field is the admin's
 *    judgment of record about a comparison they ran; an agent writing it
 *    would be putting words in the reviewer's mouth.
 *
 * TWO things DO earn a target, and they are the two below: composing an
 * exemplar (a genuinely authored artifact — see `writeTargets`) and moving
 * the workbench to a mandate so that composer is on screen at all.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const MANDATES_SURFACE_NAME = "matrx-admin/mandates";

const groups: SurfaceValueGroup[] = [
  {
    key: "mandates_console",
    label: "Mandates console",
    sortOrder: 100,
    description:
      "The full mandate list as loaded into the console table, plus the health roll-up across all mandates.",
  },
  {
    key: "selected_mandate",
    label: "Selected mandate",
    sortOrder: 200,
    description:
      "The mandate the admin has open in the side-panel workbench — pin state, health, and overrides.",
  },
  {
    key: "mandate_test_bench",
    label: "Mandate test bench",
    sortOrder: 300,
    description:
      "The exemplar bench inside the open mandate's workbench — the stored real inputs the mandate is compared against, and the exemplar the admin is composing right now. Present only while a mandate is open.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "mandate_count",
    label: "Mandate count",
    description:
      "Number of live (non-deleted) mandates loaded into the console. 0 while loading or when no mandates have been seeded yet.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 100,
    group: "mandates_console",
  },
  {
    name: "mandates_summary",
    label: "Mandates summary",
    description:
      "One entry per mandate: identity, agent and pin, worst-first health, live code/contract and code/agent drift, code variables, bound-agent variables, I/O contract, binding count, enabled flag, and placeholder flag. Empty array while loading. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 110,
    group: "mandates_console",
  },
  {
    name: "health_summary",
    label: "Health roll-up",
    description:
      'Counts of mandates per worst-first health state, including code_agent_drift, code_contract_drift, and code_truth_import_failed alongside pin health. All zeros while loading. "not_a_system_agent" is a SYSTEM-AGENT LAW violation; code_agent_drift means live code and the bound agent disagree.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 120,
    group: "mandates_console",
  },
  {
    name: "unhealthy_mandates",
    label: "Unhealthy mandates",
    description:
      'Summary entries (same shape as mandates_summary) for every mandate whose health is not "ok" — code truth drift/import failure or an unhealthy pin. Empty array when everything is healthy.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    sortOrder: 130,
    group: "mandates_console",
  },
  {
    name: "system_agent_count",
    label: "System agent count",
    description:
      "Number of system (builtin) agents available in the rebind picker — the ONLY agents a mandate default may reference. 0 until the canonical agent list loads.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 140,
    group: "mandates_console",
  },
  {
    name: "selected_mandate_id",
    label: "Selected mandate id",
    description:
      "UUID of the mandate open in the side-panel workbench. Empty when no row is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "selected_mandate",
  },
  {
    name: "selected_mandate",
    label: "Selected mandate",
    description:
      "Full detail of the open mandate: mandate_key, label, description, default agent (name + type), pin state (use_latest, pinned version, latest version, drift), health, input/output kinds, enabled flag, overrides count. Absent when no row is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 310,
    group: "selected_mandate",
  },
  {
    name: "selected_mandate_health",
    label: "Selected mandate health",
    description:
      '"ok", "version drift", "agent archived", or "not a system agent" for the open mandate. Absent when no row is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 320,
    group: "selected_mandate",
  },
  {
    name: "selected_mandate_overrides",
    label: "Selected mandate overrides",
    description:
      "Per-principal mandate_binding overrides for the open mandate: principal type, override agent name (null = settings-only), config overrides, enabled flag. Empty array when the mandate has none; absent when no row is selected. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 330,
    group: "selected_mandate",
  },
  {
    name: "selected_mandate_contract",
    label: "Selected mandate contract",
    description:
      "The open mandate's stored contract: { required_variables, required_context_policies } — the input names ANY agent pinned to this mandate must declare, seeded from the default agent. This is the vocabulary an exemplar's `variables` object has to fill: write one key per entry in required_variables. Both arrays empty means the mandate declares no required inputs and any agent qualifies. Absent when no row is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 340,
    group: "selected_mandate",
  },
  {
    name: "selected_mandate_exemplars",
    label: "Stored exemplars",
    description:
      "The open mandate's saved test inputs, one entry per exemplar: { id, label, variables, user_input }. These are the real inputs every candidate agent is run against in the bench. Read this before proposing a new exemplar — it is how you match the house style of the existing ones and avoid re-adding a case the mandate already covers. Empty array when the mandate has none; absent when no mandate workbench is open. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 400,
    group: "mandate_test_bench",
  },
  {
    name: "mandate_exemplar_draft",
    label: "Exemplar draft",
    description:
      'The exemplar the admin is composing in the bench\'s "+ Exemplar" form, and the read twin of the write target of the same name: { open, label, variables, user_input }. `open` is whether the composer is expanded — its inputs are only on screen when true. `variables` is the textarea VERBATIM (a JSON string, "{}" when untouched), NOT an object. Absent when no mandate workbench is open.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 410,
    group: "mandate_test_bench",
  },
];

/**
 * Names of the write targets below, exported so both handler seams
 * (`MandatesConsole`'s base layer and `MandateTestBench`'s live
 * implementation) can never drift from the manifest by re-typing a string.
 */
export const AGENT_MANDATES_WRITE_TARGETS = {
  selectMandate: "select_mandate",
  exemplarDraft: "mandate_exemplar_draft",
} as const;

/**
 * Write half of the 360 loop. See the JUDGMENT BAR block at the top of this
 * file for everything on this console that deliberately has NO target — that
 * list is longer than this one, and on an admin surface over live production
 * capacity that is the correct ratio.
 *
 * WHAT EARNS A TARGET HERE: composing an exemplar. An exemplar is a stored
 * REAL input the bench replays against the current binding and every
 * candidate agent — it is the evidence a rebind is safe. Writing one means
 * reading the mandate's contract, inventing an input that exercises it, and
 * phrasing a realistic user message: authored content, exactly the kind an
 * agent produces faster and more thoroughly than an admin hand-typing JSON
 * into a textarea. Nothing about it is identity, ownership, or destructive,
 * and the admin still presses "Save exemplar".
 *
 * ONE object target, not three. `label` + `variables` + `user_input` are ONE
 * act of composing a test case — the form renders them together and the Save
 * button consumes all three at once. Per the skill's trap ("multiple values
 * in one field object beat five micro-targets when they're edited together")
 * they are one target and therefore ONE confirm dialog. It also makes the
 * handler resolve them ATOMICALLY: the writeback seam resolves every staged
 * handler closure before the user confirms the first dialog, so three
 * separate targets for three mutually-dependent fields could half-land a
 * test case. Validate-then-apply inside one handler cannot.
 *
 * `select_mandate` is `mode: "ui"` — navigation, the `content-plan` `select_node`
 * precedent — but `applyPolicy: "ask"` rather than `"auto"`, which is a
 * deliberate departure. On this page the workbench REMOUNTS per mandate
 * (`key={row.id}` on `MandateEditor`, `MandateTestBench` and `MandateOverridePanel`),
 * so moving the selection DISCARDS whatever the admin has typed into the
 * rebind editor, the override editor, or the exemplar composer. A silent
 * selection change that throws away unsaved typing is not the cheap,
 * reversible view move `"auto"` is for. The handler additionally refuses
 * outright while an exemplar draft is staged and unsaved.
 *
 * ORDERING, and it matters: `mandate_exemplar_draft` is only wired while a mandate
 * workbench is open, because that is when the composer exists. The two
 * targets therefore cannot be staged in the same breath from a cold page —
 * the seam resolves handlers up front, so an exemplar sent alongside the very
 * first `select_mandate` resolves against the console's base layer and is
 * refused with a message saying exactly that. Select first, then compose.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: AGENT_MANDATES_WRITE_TARGETS.selectMandate,
    label: "Selected mandate",
    description:
      "Opens a mandate in the side-panel workbench — the same as the admin clicking its row. Nothing is saved and no mandate is changed; this only moves the view, and it is what puts the pin editor, the test bench and the overrides panel on screen. " +
      "Value: a STRING, either the mandate's `id` (UUID) or its `mandate_key` — both are in `mandates_summary`, so take one from there rather than inventing it. An id or key that no loaded mandate matches is an error, not a no-op. " +
      "Opening a different mandate REMOUNTS the workbench and discards anything the admin has typed into the rebind editor, the override editor or the exemplar composer, which is why this asks. It is refused outright while an unsaved exemplar draft is staged (`mandate_exemplar_draft.label`/`variables`/`user_input`) — save or clear that first.",
    valueType: "string",
    updatesValue: "selected_mandate_id",
    mode: "ui",
    applyPolicy: "ask",
    group: "selected_mandate",
    sortOrder: 350,
  },
  {
    name: AGENT_MANDATES_WRITE_TARGETS.exemplarDraft,
    label: "Exemplar draft",
    description:
      'Stages a test-bench exemplar into the "+ Exemplar" composer on the OPEN mandate, expanding the form so the admin sees it. NOTHING is saved and nothing runs — the admin still presses "Save exemplar", and separately "Run all" to spend budget comparing agents against it. ' +
      "Value: an object with AT LEAST ONE of `{ label, variables, user_input }`. Each key REPLACES that one field; omit a key to leave what the admin typed alone (read `mandate_exemplar_draft` first if you mean to extend rather than replace). " +
      "`label` — what this test case is called, a short non-empty string that says what it exercises (e.g. \"Long transcript, no speaker names\"). " +
      "`variables` — an OBJECT (send real JSON, not a string; it is serialized into the textarea for you). Its keys are the mandate's declared inputs: fill every entry of `selected_mandate_contract.required_variables`, and send `{}` only for a mandate whose contract declares none. Keys outside the contract are allowed but are not supplied by the mandate at run time. " +
      "`user_input` — the end-user message this exemplar replays, or an empty string for mandates driven purely by variables. " +
      "Refused unless a mandate workbench is open (read `selected_mandate_id`; use `select_mandate` first, in an earlier turn).",
    valueType: "object",
    updatesValue: "mandate_exemplar_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "mandate_test_bench",
    sortOrder: 420,
  },
];

export const mandatesManifest: SurfaceManifest = {
  surfaceName: MANDATES_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Console emitter is live (list, health roll-up, selected mandate + pin + contract + overrides), and the bench's exemplars + exemplar draft are published up through bench-draft.ts. Candidate-run state (comparison columns, batch results, verdict notes) still lives in MandateTestBench local state and is not lifted into the scope.",
  label: "Mandates Admin",
  urlPattern: "/administration/agents/mandates",
  intro: `<surface_intro>
This is an ADMIN surface: the Mandates console at /administration/agents/mandates.

A mandate is a named platform position (agent.mandate) whose work is done by a pinned SYSTEM agent — e.g. "the conversation labeler". The console shows every mandate with its current pin (a specific agent version, or floating "latest"), a worst-first Health verdict (including live code↔agent and code↔contract drift), per-principal bindings (agent.mandate_binding), and an exemplar test bench for comparing candidate agents against stored real inputs.

Two laws govern this page: (1) THE SYSTEM-AGENT LAW — a mandate default may only reference a system (builtin) agent; "not a system agent" health is always a defect to fix. (2) Latest is not always better — pins exist so a mandate's behavior only changes deliberately; "version drift" means a newer version exists, not that rebinding is required.

What you may safely do: read the mandate list, health roll-up, and the selected mandate's pin state and overrides, then help the admin reason about drift, law violations, or draft mandate labels/descriptions. You never rebind, enable, disable, or run a test yourself — those are the admin's own actions.

You can also WRITE here, through apply_surface_write, but only into two places. \`select_mandate\` opens a mandate in the side-panel workbench (its id or mandate_key, from mandates_summary) — exactly as clicking the row would. \`mandate_exemplar_draft\` stages a test-bench EXEMPLAR into that open mandate's "+ Exemplar" composer: a stored real input the bench replays against the current binding and every candidate agent, which is the evidence a rebind is safe. Read \`selected_mandate_contract\` first — its required_variables are the keys the exemplar's \`variables\` object must fill — and \`selected_mandate_exemplars\` to match the existing cases rather than duplicate one. Both targets only STAGE or MOVE: the admin still presses "Save exemplar", and separately "Run all", which is the button that actually spends model budget.
Order matters: the exemplar composer only exists once a mandate workbench is open, so select the mandate in one turn and compose in the next — an exemplar sent alongside the very first select_mandate is refused.
Nothing else here is writable, and the reasons are worth knowing: health and the roll-ups are MEASURED, not authored, so writing them would fabricate the state of the system; rebinding and per-principal overrides are agent identity by UUID over live production capacity, with no agent catalog on this surface to pick from; enable/disable and Run spend real capacity and budget. The way you move those numbers is by helping the admin decide, then letting them press the button.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One mandate as summarized in the console table. */
export interface MandateSummary {
  id: string;
  mandate_key: string;
  label: string | null;
  agent_name: string;
  pin: string;
  drift: string | null;
  health: string;
  code_truth_drift: "code_only" | "db_only" | "diff" | "match" | null;
  bound_agent_drift: "code_only" | "db_only" | "diff" | "match" | null;
  code_variables: string[];
  bound_agent_variables: string[];
  input_kind: string;
  output_kind: string;
  overrides_count: number;
  is_enabled: boolean;
  is_placeholder: boolean;
}

/** Health roll-up across all loaded mandates. */
export interface MandatesHealthSummary {
  ok: number;
  version_drift: number;
  agent_archived: number;
  not_a_system_agent: number;
  /** Pins whose agent row the caller could not read (RLS or deleted). */
  unresolved_pin: number;
  /** Live code supplies values the bound agent does not agree with. */
  code_agent_drift: number;
  /** Live code and the DB contract cache disagree. */
  code_contract_drift: number;
  /** A declaring module was found but failed to import. */
  code_truth_import_failed: number;
}

/** Full detail of the mandate open in the workbench. */
export interface MandateDetail extends MandateSummary {
  description: string | null;
  agent_type: string | null;
  use_latest: boolean;
  pinned_version: number | null;
  latest_version: number | null;
}

/** The selected mandate's stored contract — what any pinned agent must declare. */
export interface MandateContract {
  required_variables: string[];
  required_context_policies: string[];
  /** The mandate's output promise beyond a registered kind — structured keys
   * any bound agent's output must produce. */
  required_output_keys: string[];
}

/** One stored bench exemplar on the selected mandate. */
export interface MandateExemplar {
  id: string;
  label: string;
  variables: Record<string, unknown> | null;
  user_input: string | null;
}

/** The bench's "+ Exemplar" composer, as the surface exposes it. */
export interface MandateExemplarDraft {
  open: boolean;
  label: string;
  /** The variables textarea VERBATIM — a JSON string, not an object. */
  variables: string;
  user_input: string;
}

/** One per-principal override on the selected mandate. */
export interface MandateOverrideSummary {
  principal_type: string;
  agent_name: string | null;
  config_overrides: Record<string, unknown> | null;
  is_enabled: boolean;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createMandatesScope(values: {
  // alwaysAvailable: true → required
  mandate_count: number;
  mandates_summary: MandateSummary[];
  health_summary: MandatesHealthSummary;
  unhealthy_mandates: MandateSummary[];
  system_agent_count: number;
  // alwaysAvailable: false → optional
  selected_mandate_id?: string;
  selected_mandate?: MandateDetail;
  selected_mandate_health?: string;
  selected_mandate_overrides?: MandateOverrideSummary[];
  selected_mandate_contract?: MandateContract;
  selected_mandate_exemplars?: MandateExemplar[];
  mandate_exemplar_draft?: MandateExemplarDraft;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
