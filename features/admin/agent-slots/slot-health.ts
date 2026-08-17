/**
 * Slot health model shared by the console table and the slot workbench drawer.
 * `buildRow` derives one `SlotRow` per slot from the console data bundle;
 * health is worst-first and drives both the table's Health column and the
 * drawer's status banner.
 */

import { isJsonObject } from "@/types/json";
import { parseSlotContract } from "@/features/agents/slots/overrides";
import { splitSlotKey } from "@/features/agents/slots/slot-key";
import type {
  SlotCodeTruth,
  SlotConsoleData,
  SlotDefinitionRow,
} from "./service";

/** Slot health, worst-first. Drives the Health column + the drawer banner. */
export type SlotHealth =
  | "code ↔ agent drift"
  | "code truth import failed"
  | "unresolved pin"
  | "not a system agent"
  | "agent archived"
  | "code ↔ contract drift"
  | "version drift"
  | "ok";

/** Stable worst-first order for both primary-health selection and table rows. */
export const HEALTH_PRIORITY: Record<SlotHealth, number> = {
  "code ↔ agent drift": 0,
  "code truth import failed": 1,
  "unresolved pin": 2,
  "not a system agent": 3,
  "agent archived": 4,
  "code ↔ contract drift": 5,
  "version drift": 6,
  ok: 7,
};

/**
 * Where a given agent's record actually lives. System agents open in the
 * admin shell; personal agents open in the user shell. Both trees carry the
 * same sub-routes (/build, /run, /v, /surfaces …).
 */
export const SYSTEM_AGENT_BASE = "/administration/agents/system-agents/agents";
export const USER_AGENT_BASE = "/agents";

export function agentHref(
  id: string,
  agentType: string | null,
  sub = "",
): string {
  return `${agentType === "builtin" ? SYSTEM_AGENT_BASE : USER_AGENT_BASE}/${id}${sub}`;
}

export interface SlotRow {
  slot: SlotDefinitionRow;
  id: string;
  slotKey: string;
  /** First segment of the canonical `<feature>.<slot>` key. */
  feature: string;
  /** Everything after the first dot; later dots remain part of the slot. */
  slotName: string;
  label: string | null;
  /** The agent behind the slot default — null only when the pin is broken. */
  agentId: string | null;
  agentName: string;
  agentType: string | null;
  pinnedVersionNumber: number | null;
  latestVersion: number | null;
  pinLabel: string;
  /** e.g. "v7 is latest" when the pin trails the agent's master version. */
  drift: string | null;
  health: SlotHealth;
  /** Live source/agent/DB comparison from aidream; null means this slot has no
   * returned report (for example while the endpoint is unavailable). */
  codeTruth: SlotCodeTruth | null;
  inputKind: string;
  outputKind: string;
  /** The slot's REAL inputs — the contract's required variables. Every run
   * can also carry free user text on top of these. */
  requiredVariables: string[];
  requiredContextSlots: string[];
  /** The slot's output promise beyond a registered kind — the structured
   * keys any bound agent must produce. */
  requiredOutputKeys: string[];
  /** Search/sort/filter accessor for the Inputs column. */
  inputSummary: string;
  /** Search/sort/filter accessor for the Output column. */
  outputSummary: string;
  overridesCount: number;
  isEnabled: boolean;
  isPlaceholder: boolean;
  updatedAt: string | null;
}

export function buildRow(
  slot: SlotDefinitionRow,
  data: SlotConsoleData,
  codeTruth?: SlotCodeTruth,
): SlotRow {
  let agentId: string | null = null;
  let agentName = "(unknown agent)";
  let agentType: string | null = null;
  let pinnedVersionNumber: number | null = null;
  let latestVersion: number | null = null;
  let pinLabel = "latest";
  let drift: string | null = null;
  let nonSystem = false;
  let archived = false;

  if (slot.default_agent_version_id) {
    const version = data.versionsById[slot.default_agent_version_id];
    const agent = version?.agentId
      ? data.agentsById[version.agentId]
      : undefined;
    const latest = agent?.version ?? null;
    const pinned = version?.versionNumber ?? null;
    agentId = agent?.id ?? version?.agentId ?? null;
    agentName = agent?.name ?? version?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    pinnedVersionNumber = pinned;
    latestVersion = latest;
    // The column header already says "Pin" — the value is just the version.
    pinLabel = pinned != null ? `v${pinned}` : "unknown version";
    if (pinned != null && latest != null && latest > pinned)
      drift = `v${pinned} → v${latest}`;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  } else {
    const agent = slot.default_agent_id
      ? data.agentsById[slot.default_agent_id]
      : undefined;
    agentId = agent?.id ?? slot.default_agent_id ?? null;
    agentName = agent?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    latestVersion = agent?.version ?? null;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  }

  // An agent the console could not resolve is NEVER "ok" — it means the pin
  // points at a row this admin can't read (personal agent under another
  // owner's RLS) or at a deleted record. Silently reporting green there is
  // exactly the kind of dead end this console exists to prevent.
  const unresolved = agentId == null || agentType == null;

  const codeAgentDrift =
    codeTruth?.resolution === "code_declaration_found" &&
    codeTruth.bound_agent_drift != null &&
    codeTruth.bound_agent_drift !== "match";
  const codeContractDrift =
    codeTruth?.resolution === "code_declaration_found" &&
    codeTruth.drift !== "match";
  const codeImportFailed =
    codeTruth?.resolution === "code_exists_but_import_failed";

  const health: SlotHealth = codeAgentDrift
    ? "code ↔ agent drift"
    : codeImportFailed
      ? "code truth import failed"
      : unresolved
        ? "unresolved pin"
        : nonSystem
          ? "not a system agent"
          : archived
            ? "agent archived"
            : codeContractDrift
              ? "code ↔ contract drift"
              : drift
                ? "version drift"
                : "ok";

  // The contract is the slot's factual I/O declaration — the Inputs and
  // Output columns render THIS, never the bare input_kind/output_kind
  // columns (which are null for most slots and were reporting "—"/"text"
  // while the contract declared five required variables).
  const contract = parseSlotContract(slot.contract);
  const slotKeyParts = splitSlotKey(slot.slot_key);

  return {
    slot,
    id: slot.id,
    slotKey: slot.slot_key,
    feature: slotKeyParts.feature,
    slotName: slotKeyParts.slot,
    label: slot.label,
    agentId,
    agentName,
    agentType,
    pinnedVersionNumber,
    latestVersion,
    pinLabel,
    drift,
    health,
    codeTruth: codeTruth ?? null,
    inputKind: slot.input_kind ?? "—",
    outputKind: slot.output_kind ?? "text",
    requiredVariables: contract.requiredVariables,
    requiredContextSlots: contract.requiredContextSlots,
    requiredOutputKeys: contract.requiredOutputKeys,
    inputSummary:
      contract.requiredVariables.length > 0
        ? contract.requiredVariables.join(", ")
        : "user text only",
    outputSummary:
      slot.output_kind ??
      (contract.requiredOutputKeys.length > 0
        ? contract.requiredOutputKeys.join(", ")
        : "unspecified"),
    overridesCount: (data.bindingsBySlotId[slot.id] ?? []).length,
    isEnabled: Boolean(slot.is_enabled),
    isPlaceholder:
      isJsonObject(slot.metadata) &&
      slot.metadata.migration_status === "placeholder",
    updatedAt: slot.updated_at ?? null,
  };
}

export const HEALTH_CLASS: Record<SlotHealth, string> = {
  ok: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  "code ↔ agent drift": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "code truth import failed":
    "text-amber-600 border-amber-500/40 bg-amber-500/10",
  "version drift": "text-amber-600 border-amber-500/40 bg-amber-500/10",
  "code ↔ contract drift": "text-amber-600 border-amber-500/40 bg-amber-500/10",
  "agent archived": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "not a system agent": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "unresolved pin": "text-rose-600 border-rose-500/40 bg-rose-500/10",
};

/** What the admin should do about each unhealthy state — shown, not implied. */
export const HEALTH_HINT: Partial<Record<SlotHealth, string>> = {
  "code ↔ agent drift":
    "The calling code and the bound agent disagree about which variables exist. Values may be dropping before the prompt.",
  "code truth import failed":
    "aidream found the code declaration but could not import it, so this slot cannot be verified from live code.",
  "code ↔ contract drift":
    "The live code declaration and the slot's stored contract cache disagree. Code truth is authoritative.",
  "version drift":
    "A newer saved version of this agent exists — users keep getting the pinned one until the pin is updated.",
  "unresolved pin":
    "This slot's agent could not be read — it may be another user's personal agent, or a deleted record. Repin it to a system agent.",
  "not a system agent":
    "This slot serves every user, but its default is a personal agent only some of them can see.",
  "agent archived": "The pinned agent is archived — repin before it breaks.",
};
