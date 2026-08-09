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
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
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
];

export const agentSlotsManifest: SurfaceManifest = {
  surfaceName: AGENT_SLOTS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Console emitter is live (list, health roll-up, selected slot + pin + overrides). Test-bench state (exemplars, candidate runs) lives in SlotTestBench local state and is not lifted into the scope yet.",
  label: "Agent Slots Admin",
  urlPattern: "/administration/agents/slots",
  intro: `<surface_intro>
This is an ADMIN surface: the Agent Slots console at /administration/agents/slots.

A slot is a named platform position (agent.slot_definition) whose work is done by a pinned SYSTEM agent — e.g. "the conversation labeler". The console shows every slot with its current pin (a specific agent version, or floating "latest"), a Health verdict (ok / version drift / agent archived / not a system agent), per-principal overrides (agent.slot_binding), and an exemplar test bench for comparing candidate agents against stored real inputs.

Two laws govern this page: (1) THE SYSTEM-AGENT LAW — a slot default may only reference a system (builtin) agent; "not a system agent" health is always a defect to fix. (2) Latest is not always better — pins exist so a slot's behavior only changes deliberately; "version drift" means a newer version exists, not that repinning is required.

What you may safely do: read the slot list, health roll-up, and the selected slot's pin state and overrides, then help the admin reason about drift, law violations, or draft slot labels/descriptions. You never repin, enable, disable, or run a test yourself — those are the admin's own actions.
</surface_intro>`,
  groups,
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
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
