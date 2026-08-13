/**
 * Slot health model shared by the console table and the slot workbench drawer.
 * `buildRow` derives one `SlotRow` per slot from the console data bundle;
 * health is worst-first and drives both the table's Health column and the
 * drawer's status banner.
 */

import { isJsonObject } from "@/types/json";
import type {
  SlotConsoleData,
  SlotDefinitionRow,
} from "./service";

/** Slot health, worst-first. Drives the Health column + the drawer banner. */
export type SlotHealth =
  | "unresolved pin"
  | "not a system agent"
  | "agent archived"
  | "version drift"
  | "ok";

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
  inputKind: string;
  outputKind: string;
  overridesCount: number;
  isEnabled: boolean;
  isPlaceholder: boolean;
  updatedAt: string | null;
}

export function buildRow(
  slot: SlotDefinitionRow,
  data: SlotConsoleData,
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
    pinLabel =
      pinned != null ? `pinned v${pinned}` : "pinned (unknown version)";
    if (pinned != null && latest != null && latest > pinned)
      drift = `v${latest} is latest`;
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

  const health: SlotHealth = unresolved
    ? "unresolved pin"
    : nonSystem
      ? "not a system agent"
      : archived
        ? "agent archived"
        : drift
          ? "version drift"
          : "ok";

  return {
    slot,
    id: slot.id,
    slotKey: slot.slot_key,
    label: slot.label,
    agentId,
    agentName,
    agentType,
    pinnedVersionNumber,
    latestVersion,
    pinLabel,
    drift,
    health,
    inputKind: slot.input_kind ?? "—",
    outputKind: slot.output_kind ?? "text",
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
  "version drift": "text-amber-600 border-amber-500/40 bg-amber-500/10",
  "agent archived": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "not a system agent": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "unresolved pin": "text-rose-600 border-rose-500/40 bg-rose-500/10",
};

/** What the admin should do about each unhealthy state — shown, not implied. */
export const HEALTH_HINT: Partial<Record<SlotHealth, string>> = {
  "unresolved pin":
    "This slot's agent could not be read — it may be another user's personal agent, or a deleted record. Repin it to a system agent.",
  "not a system agent":
    "This slot serves every user, but its default is a personal agent only some of them can see.",
  "agent archived": "The pinned agent is archived — repin before it breaks.",
};
