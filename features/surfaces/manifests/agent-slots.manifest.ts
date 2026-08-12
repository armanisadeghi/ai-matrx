/**
 * Surface manifest — Agent Slots admin (`matrx-admin/agent-slots`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/slots` — the console over
 * every DB-managed agent slot (`agent.slot_definition` / `agent.slot_binding`):
 * current pin (vs latest), health, enable/disable, repin, per-principal
 * overrides, and the exemplar test bench. Backed by
 * `features/admin/agent-slots/AgentSlotsConsole.tsx`; cross-repo
 * system-of-record: common-docs/systems/agent-slots/FEATURE.md.
 *
 * What an agent bound here may safely do: read the slot list, the health
 * roll-up, and the selected slot's pin state, then help the admin reason
 * about drift ("v7 is latest"), THE SYSTEM-AGENT LAW violations ("not a
 * system agent"), or draft a label/description. It must NEVER assume a
 * repin, enable/disable, or test run has happened — those are the admin's
 * own actions.
 *
 * Emitter: `AgentSlotsConsole` mounts `<SurfaceRuntimeProvider>` and builds
 * the scope at Run time via `createAgentSlotsScope`.
 *
 * ── THE JUDGMENT BAR ON THIS SURFACE (read before adding a target) ──────
 * Almost everything this console shows is OBSERVED OPERATIONAL EVIDENCE, and
 * evidence is never agent-writable. `slot_count`, `slots_summary`,
 * `health_summary`, `unhealthy_slots`, `system_agent_count` and
 * `selected_slot_health` are MEASURED from the live `agent.slot_definition` /
 * `agent.slot_binding` rows and the canonical agent slice — health in
 * particular is computed, not authored, so an agent writing it would be
 * fabricating the state of the system. That is the same line
 * `education-grade-work` drew around grader output and `transcripts-cleanup`
 * drew around `raw_transcript_text`.
 *
 * The console's own controls fail the bar for their own reasons, all of them
 * deliberate:
 *  - **Repin** (`SlotEditor` — agent, track-latest, pinned version). WHICH
 *    agent occupies a slot is identity by UUID, and changing it changes what
 *    runs for every user the slot serves. The agent catalog behind the picker
 *    (`selectBuiltinAgents`) is not a surface value — only its COUNT is — so
 *    an agent writing it would be guessing a UUID. This is exactly why
 *    `agent_id` was deferred on `matrx-user/pdf-extractor`.
 *  - **Enable / disable a slot** and the bench's **Run all**. Both touch live
 *    production capacity or spend real model budget across every exemplar.
 *    The settled precedent across this campaign (`marketing-crawls` Start
 *    crawl, `pdf-extractor` Run) is that spending real resources stays behind
 *    a human press.
 *  - **Per-principal overrides** (`SlotOverrideEditor` — the tempting
 *    `selected_slot_overrides` candidate). On inspection it holds three
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
 * the workbench to a slot so that composer is on screen at all.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const AGENT_SLOTS_SURFACE_NAME = "matrx-admin/agent-slots";

const groups: SurfaceValueGroup[] = [
  {
    key: "slots_console",
    label: "Slots console",
    sortOrder: 100,
    description:
      "The full slot list as loaded into the console table, plus the health roll-up across all slots.",
  },
  {
    key: "selected_slot",
    label: "Selected slot",
    sortOrder: 200,
    description:
      "The slot the admin has open in the side-panel workbench — pin state, health, and overrides.",
  },
  {
    key: "slot_test_bench",
    label: "Slot test bench",
    sortOrder: 300,
    description:
      "The exemplar bench inside the open slot's workbench — the stored real inputs the slot is compared against, and the exemplar the admin is composing right now. Present only while a slot is open.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "slot_count",
    label: "Slot count",
    description:
      "Number of live (non-deleted) agent slots loaded into the console. 0 while loading or when no slots have been seeded yet.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 100,
    group: "slots_console",
  },
  {
    name: "slots_summary",
    label: "Slots summary",
    description:
      "One entry per slot: id, slot_key, label, agent name, pin label, drift, health, input/output kinds, overrides count, enabled flag, placeholder flag. Empty array while loading. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 110,
    group: "slots_console",
  },
  {
    name: "health_summary",
    label: "Health roll-up",
    description:
      'Counts of slots per health state: { ok, version_drift, agent_archived, not_a_system_agent }. All zeros while loading. "not_a_system_agent" is a SYSTEM-AGENT LAW violation and always a defect.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 120,
    group: "slots_console",
  },
  {
    name: "unhealthy_slots",
    label: "Unhealthy slots",
    description:
      "Summary entries (same shape as slots_summary) for every slot whose health is not \"ok\" — version drift, archived agent, or a non-system-agent pin. Empty array when everything is healthy.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    sortOrder: 130,
    group: "slots_console",
  },
  {
    name: "system_agent_count",
    label: "System agent count",
    description:
      "Number of system (builtin) agents available in the repin picker — the ONLY agents a slot default may reference. 0 until the canonical agent list loads.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 140,
    group: "slots_console",
  },
  {
    name: "selected_slot_id",
    label: "Selected slot id",
    description:
      "UUID of the slot open in the side-panel workbench. Empty when no row is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "selected_slot",
  },
  {
    name: "selected_slot",
    label: "Selected slot",
    description:
      "Full detail of the open slot: slot_key, label, description, default agent (name + type), pin state (use_latest, pinned version, latest version, drift), health, input/output kinds, enabled flag, overrides count. Absent when no row is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 310,
    group: "selected_slot",
  },
  {
    name: "selected_slot_health",
    label: "Selected slot health",
    description:
      '"ok", "version drift", "agent archived", or "not a system agent" for the open slot. Absent when no row is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 320,
    group: "selected_slot",
  },
  {
    name: "selected_slot_overrides",
    label: "Selected slot overrides",
    description:
      "Per-principal slot_binding overrides for the open slot: principal type, override agent name (null = settings-only), config overrides, enabled flag. Empty array when the slot has none; absent when no row is selected. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 330,
    group: "selected_slot",
  },
  {
    name: "selected_slot_contract",
    label: "Selected slot contract",
    description:
      "The open slot's stored contract: { required_variables, required_context_slots } — the input names ANY agent pinned to this slot must declare, seeded from the default agent. This is the vocabulary an exemplar's `variables` object has to fill: write one key per entry in required_variables. Both arrays empty means the slot declares no required inputs and any agent qualifies. Absent when no row is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 340,
    group: "selected_slot",
  },
  {
    name: "selected_slot_exemplars",
    label: "Stored exemplars",
    description:
      "The open slot's saved test inputs, one entry per exemplar: { id, label, variables, user_input }. These are the real inputs every candidate agent is run against in the bench. Read this before proposing a new exemplar — it is how you match the house style of the existing ones and avoid re-adding a case the slot already covers. Empty array when the slot has none; absent when no slot workbench is open. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 400,
    group: "slot_test_bench",
  },
  {
    name: "slot_exemplar_draft",
    label: "Exemplar draft",
    description:
      'The exemplar the admin is composing in the bench\'s "+ Exemplar" form, and the read twin of the write target of the same name: { open, label, variables, user_input }. `open` is whether the composer is expanded — its inputs are only on screen when true. `variables` is the textarea VERBATIM (a JSON string, "{}" when untouched), NOT an object. Absent when no slot workbench is open.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 410,
    group: "slot_test_bench",
  },
];

/**
 * Names of the write targets below, exported so both handler seams
 * (`AgentSlotsConsole`'s base layer and `SlotTestBench`'s live
 * implementation) can never drift from the manifest by re-typing a string.
 */
export const AGENT_SLOTS_WRITE_TARGETS = {
  selectSlot: "select_slot",
  exemplarDraft: "slot_exemplar_draft",
} as const;

/**
 * Write half of the 360 loop. See the JUDGMENT BAR block at the top of this
 * file for everything on this console that deliberately has NO target — that
 * list is longer than this one, and on an admin surface over live production
 * capacity that is the correct ratio.
 *
 * WHAT EARNS A TARGET HERE: composing an exemplar. An exemplar is a stored
 * REAL input the bench replays against the current binding and every
 * candidate agent — it is the evidence a repin is safe. Writing one means
 * reading the slot's contract, inventing an input that exercises it, and
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
 * `select_slot` is `mode: "ui"` — navigation, the `content-plan` `select_node`
 * precedent — but `applyPolicy: "ask"` rather than `"auto"`, which is a
 * deliberate departure. On this page the workbench REMOUNTS per slot
 * (`key={row.id}` on `SlotEditor`, `SlotTestBench` and `SlotOverridePanel`),
 * so moving the selection DISCARDS whatever the admin has typed into the
 * repin editor, the override editor, or the exemplar composer. A silent
 * selection change that throws away unsaved typing is not the cheap,
 * reversible view move `"auto"` is for. The handler additionally refuses
 * outright while an exemplar draft is staged and unsaved.
 *
 * ORDERING, and it matters: `slot_exemplar_draft` is only wired while a slot
 * workbench is open, because that is when the composer exists. The two
 * targets therefore cannot be staged in the same breath from a cold page —
 * the seam resolves handlers up front, so an exemplar sent alongside the very
 * first `select_slot` resolves against the console's base layer and is
 * refused with a message saying exactly that. Select first, then compose.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: AGENT_SLOTS_WRITE_TARGETS.selectSlot,
    label: "Selected slot",
    description:
      "Opens a slot in the side-panel workbench — the same as the admin clicking its row. Nothing is saved and no slot is changed; this only moves the view, and it is what puts the pin editor, the test bench and the overrides panel on screen. " +
      "Value: a STRING, either the slot's `id` (UUID) or its `slot_key` — both are in `slots_summary`, so take one from there rather than inventing it. An id or key that no loaded slot matches is an error, not a no-op. " +
      "Opening a different slot REMOUNTS the workbench and discards anything the admin has typed into the repin editor, the override editor or the exemplar composer, which is why this asks. It is refused outright while an unsaved exemplar draft is staged (`slot_exemplar_draft.label`/`variables`/`user_input`) — save or clear that first.",
    valueType: "string",
    updatesValue: "selected_slot_id",
    mode: "ui",
    applyPolicy: "ask",
    group: "selected_slot",
    sortOrder: 350,
  },
  {
    name: AGENT_SLOTS_WRITE_TARGETS.exemplarDraft,
    label: "Exemplar draft",
    description:
      'Stages a test-bench exemplar into the "+ Exemplar" composer on the OPEN slot, expanding the form so the admin sees it. NOTHING is saved and nothing runs — the admin still presses "Save exemplar", and separately "Run all" to spend budget comparing agents against it. ' +
      "Value: an object with AT LEAST ONE of `{ label, variables, user_input }`. Each key REPLACES that one field; omit a key to leave what the admin typed alone (read `slot_exemplar_draft` first if you mean to extend rather than replace). " +
      "`label` — what this test case is called, a short non-empty string that says what it exercises (e.g. \"Long transcript, no speaker names\"). " +
      "`variables` — an OBJECT (send real JSON, not a string; it is serialized into the textarea for you). Its keys are the slot's declared inputs: fill every entry of `selected_slot_contract.required_variables`, and send `{}` only for a slot whose contract declares none. Keys outside the contract are allowed but are not supplied by the slot at run time. " +
      "`user_input` — the end-user message this exemplar replays, or an empty string for slots driven purely by variables. " +
      "Refused unless a slot workbench is open (read `selected_slot_id`; use `select_slot` first, in an earlier turn).",
    valueType: "object",
    updatesValue: "slot_exemplar_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "slot_test_bench",
    sortOrder: 420,
  },
];

export const agentSlotsManifest: SurfaceManifest = {
  surfaceName: AGENT_SLOTS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Console emitter is live (list, health roll-up, selected slot + pin + contract + overrides), and the bench's exemplars + exemplar draft are published up through bench-draft.ts. Candidate-run state (comparison columns, batch results, verdict notes) still lives in SlotTestBench local state and is not lifted into the scope. Write targets are code-only (not mirrored to DB).",
  label: "Agent Slots Admin",
  urlPattern: "/administration/agents/slots",
  intro: `<surface_intro>
This is an ADMIN surface: the Agent Slots console at /administration/agents/slots.

A slot is a named platform position (agent.slot_definition) whose work is done by a pinned SYSTEM agent — e.g. "the conversation labeler". The console shows every slot with its current pin (a specific agent version, or floating "latest"), a Health verdict (ok / version drift / agent archived / not a system agent), per-principal overrides (agent.slot_binding), and an exemplar test bench for comparing candidate agents against stored real inputs.

Two laws govern this page: (1) THE SYSTEM-AGENT LAW — a slot default may only reference a system (builtin) agent; "not a system agent" health is always a defect to fix. (2) Latest is not always better — pins exist so a slot's behavior only changes deliberately; "version drift" means a newer version exists, not that repinning is required.

What you may safely do: read the slot list, health roll-up, and the selected slot's pin state and overrides, then help the admin reason about drift, law violations, or draft slot labels/descriptions. You never repin, enable, disable, or run a test yourself — those are the admin's own actions.

You can also WRITE here, through apply_surface_write, but only into two places. \`select_slot\` opens a slot in the side-panel workbench (its id or slot_key, from slots_summary) — exactly as clicking the row would. \`slot_exemplar_draft\` stages a test-bench EXEMPLAR into that open slot's "+ Exemplar" composer: a stored real input the bench replays against the current binding and every candidate agent, which is the evidence a repin is safe. Read \`selected_slot_contract\` first — its required_variables are the keys the exemplar's \`variables\` object must fill — and \`selected_slot_exemplars\` to match the existing cases rather than duplicate one. Both targets only STAGE or MOVE: the admin still presses "Save exemplar", and separately "Run all", which is the button that actually spends model budget.
Order matters: the exemplar composer only exists once a slot workbench is open, so select the slot in one turn and compose in the next — an exemplar sent alongside the very first select_slot is refused.
Nothing else here is writable, and the reasons are worth knowing: health and the roll-ups are MEASURED, not authored, so writing them would fabricate the state of the system; repinning and per-principal overrides are agent identity by UUID over live production capacity, with no agent catalog on this surface to pick from; enable/disable and Run spend real capacity and budget. The way you move those numbers is by helping the admin decide, then letting them press the button.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One slot as summarized in the console table. */
export interface AgentSlotSummary {
  id: string;
  slot_key: string;
  label: string | null;
  agent_name: string;
  pin: string;
  drift: string | null;
  health: string;
  input_kind: string;
  output_kind: string;
  overrides_count: number;
  is_enabled: boolean;
  is_placeholder: boolean;
}

/** Health roll-up across all loaded slots. */
export interface AgentSlotsHealthSummary {
  ok: number;
  version_drift: number;
  agent_archived: number;
  not_a_system_agent: number;
  /** Pins whose agent row the caller could not read (RLS or deleted). */
  unresolved_pin: number;
}

/** Full detail of the slot open in the workbench. */
export interface AgentSlotDetail extends AgentSlotSummary {
  description: string | null;
  agent_type: string | null;
  use_latest: boolean;
  pinned_version: number | null;
  latest_version: number | null;
}

/** The selected slot's stored contract — what any pinned agent must declare. */
export interface AgentSlotContract {
  required_variables: string[];
  required_context_slots: string[];
}

/** One stored bench exemplar on the selected slot. */
export interface AgentSlotExemplar {
  id: string;
  label: string;
  variables: Record<string, unknown> | null;
  user_input: string | null;
}

/** The bench's "+ Exemplar" composer, as the surface exposes it. */
export interface AgentSlotExemplarDraft {
  open: boolean;
  label: string;
  /** The variables textarea VERBATIM — a JSON string, not an object. */
  variables: string;
  user_input: string;
}

/** One per-principal override on the selected slot. */
export interface AgentSlotOverrideSummary {
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
export function createAgentSlotsScope(values: {
  // alwaysAvailable: true → required
  slot_count: number;
  slots_summary: AgentSlotSummary[];
  health_summary: AgentSlotsHealthSummary;
  unhealthy_slots: AgentSlotSummary[];
  system_agent_count: number;
  // alwaysAvailable: false → optional
  selected_slot_id?: string;
  selected_slot?: AgentSlotDetail;
  selected_slot_health?: string;
  selected_slot_overrides?: AgentSlotOverrideSummary[];
  selected_slot_contract?: AgentSlotContract;
  selected_slot_exemplars?: AgentSlotExemplar[];
  slot_exemplar_draft?: AgentSlotExemplarDraft;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
