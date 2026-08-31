/**
 * Mandate health model shared by the console table and the mandate workbench drawer.
 * `buildRow` derives one `MandateRow` per mandate from the console data bundle;
 * health is worst-first and drives both the table's Health column and the
 * drawer's status banner.
 */

import { isJsonObject } from "@/types/json";
import { parseMandateContract } from "@/features/mandates/overrides";
import { splitMandateKey } from "@/features/mandates/mandate-key";
import { parseMandateWave1 } from "@/features/mandates/provision-shapes";
import {
  contractOfMandate,
  holderOfMandate,
  inputKindOfMandate,
} from "@/lib/supabase/mandateStorage";
import type {
  MandateCodeTruth,
  MandateConsoleData,
  MandateDefinitionRow,
} from "./service";

/** Mandate health, worst-first. Drives the Health column + the drawer banner. */
export type MandateHealth =
  | "code ↔ agent drift"
  | "code truth import failed"
  | "unresolved pin"
  | "not a system agent"
  | "agent archived"
  | "code ↔ contract drift"
  | "version drift"
  | "no holder yet"
  | "ok";

/**
 * Stable worst-first order for both primary-health selection and table rows.
 *
 * 🚨 `no holder yet` IS NOT A DEFECT and sorts beside `ok`, not with the red
 * states. See `buildRow`'s `hasPin` note: a mandate that was never pinned used
 * to be reported as `unresolved pin` — a rose alert offering to replace an
 * agent that had never been chosen, on EVERY mandate a person creates.
 */
export const HEALTH_PRIORITY: Record<MandateHealth, number> = {
  "code ↔ agent drift": 0,
  "code truth import failed": 1,
  "unresolved pin": 2,
  "not a system agent": 3,
  "agent archived": 4,
  "code ↔ contract drift": 5,
  "version drift": 6,
  "no holder yet": 7,
  ok: 8,
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

export interface MandateRow {
  mandate: MandateDefinitionRow;
  id: string;
  mandateKey: string;
  /** First segment of the canonical `<feature>.<mandate>` key. */
  feature: string;
  /** Everything after the first dot; later dots remain part of the mandate. */
  mandateName: string;
  label: string | null;
  /** The agent behind the mandate default — null only when the pin is broken. */
  agentId: string | null;
  agentName: string;
  agentType: string | null;
  pinnedVersionNumber: number | null;
  latestVersion: number | null;
  pinLabel: string;
  /** e.g. "v7 is latest" when the pin trails the agent's master version. */
  drift: string | null;
  health: MandateHealth;
  /** Live source/agent/DB comparison from aidream; null means this mandate has no
   * returned report (for example while the endpoint is unavailable). */
  codeTruth: MandateCodeTruth | null;
  inputKind: string;
  outputKind: string;
  /** The mandate's REAL inputs — the contract's required variables. Every run
   * can also carry free user text on top of these. EMPTY BY DESIGN for a
   * mandate with a Provision: the Provision replaced this field, so read
   * `provisionKey` before concluding a mandate has no declared inputs. */
  requiredVariables: string[];
  /** The Provision that IS this mandate's input declaration, when it has one. */
  provisionKey: string | null;
  /**
   * THE MANDATE'S OWN described inputs (`mandate.definition.draft_inputs`) —
   * what a person wrote when they authored this job. A third real input
   * declaration beside the contract and the Provision, and the ONLY one a
   * user-authored mandate has. Read it before concluding a mandate has no
   * inputs.
   */
  draftInputDescriptions: string[];
  /**
   * THE BOUND HOLDER'S own declared variables + context policy keys — the
   * fourth real source. An agent that declares `topic` accepts `topic`,
   * whether or not any code ever declared the mandate.
   */
  holderDeclarations: string[];
  requiredContextPolicyKeys: string[];
  /** The MANDATE's own Context Policy gate (`agent.mandate.auto_context_disabled`). */
  contextGateClosed: boolean;
  /** The HOLDER's own kill switch (`agent.definition.auto_context_disabled`). */
  holderContextClosed: boolean;
  /**
   * What actually happens at run time. A gate may only NARROW, so this is
   * `holder OR mandate` — a Mandate can close what the Holder would have
   * accepted, but can never reopen what the Holder refused.
   */
  contextClosedEffective: boolean;
  /** The mandate's output promise beyond a registered kind — the structured
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

/** The mandate's own described inputs — the declaration a person wrote. */
export function draftInputDescriptions(mandate: MandateDefinitionRow): string[] {
  const raw: unknown = (mandate as { draft_inputs?: unknown }).draft_inputs;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (description || name) out.push(description || name);
  }
  return out;
}

/**
 * THE FOUR INPUT DECLARATIONS, strongest first — and the ONE place that may
 * conclude "user text only".
 */
function inputSummaryOf(
  mandate: MandateDefinitionRow,
  requiredVariables: string[],
  agentId: string | null,
  data: MandateConsoleData,
): string {
  if (requiredVariables.length > 0) return requiredVariables.join(", ");
  const provisionKey = parseMandateWave1(mandate).provisionKey;
  if (provisionKey) return provisionKey;
  const described = draftInputDescriptions(mandate);
  if (described.length > 0) return described.join(", ");
  const agent = agentId ? data.agentsById[agentId] : undefined;
  const declared = [
    ...(agent?.variableNames ?? []),
    ...(agent?.contextPolicyKeys ?? []),
  ];
  if (declared.length > 0) return declared.join(", ");
  return "user text only";
}

export function buildRow(
  mandate: MandateDefinitionRow,
  data: MandateConsoleData,
  codeTruth?: MandateCodeTruth,
): MandateRow {
  let agentId: string | null = null;
  let agentName = "(unknown agent)";
  let agentType: string | null = null;
  let pinnedVersionNumber: number | null = null;
  let latestVersion: number | null = null;
  let pinLabel = "latest";
  let drift: string | null = null;
  let nonSystem = false;
  let archived = false;

  const holder = holderOfMandate(mandate);
  if (holder.versionId) {
    const version = data.versionsById[holder.versionId];
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
    const agent = holder.holderId
      ? data.agentsById[holder.holderId]
      : undefined;
    agentId = agent?.id ?? holder.holderId ?? null;
    agentName = agent?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    latestVersion = agent?.version ?? null;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  }

  // 🚨 NO PIN IS NOT A BROKEN PIN (V2-2, walked on production 2026-08-31).
  // A mandate that has never been bound carries neither a holder id nor a
  // version id, so `agentId` is null — and every agent-derived verdict below
  // read that null as "the pinned agent could not be read". Every newly
  // created mandate therefore opened its admin panel on a rose alert claiming
  // "The pinned agent no longer exists", about a pin that never existed, two
  // inches under the workspace correctly saying "No holder yet". The state is
  // real and calm, and it now has its own name.
  const hasPin = Boolean(holder.versionId || holder.holderId);

  // An agent the console could not resolve is NEVER "ok" — it means the pin
  // points at a row this admin can't read (personal agent under another
  // owner's RLS) or at a deleted record. Silently reporting green there is
  // exactly the kind of dead end this console exists to prevent. It requires
  // a pin to exist in the first place.
  const unresolved = hasPin && (agentId == null || agentType == null);

  // Code ↔ AGENT drift compares the code declaration to the BOUND agent. With
  // nothing bound there is no second side, so the comparison cannot be made.
  const codeAgentDrift =
    hasPin &&
    codeTruth?.resolution === "code_declaration_found" &&
    codeTruth.bound_agent_drift != null &&
    codeTruth.bound_agent_drift !== "match";
  const codeContractDrift =
    codeTruth?.resolution === "code_declaration_found" &&
    codeTruth.drift !== "match";
  const codeImportFailed =
    codeTruth?.resolution === "code_exists_but_import_failed";

  const health: MandateHealth = codeAgentDrift
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
                : hasPin
                  ? "ok"
                  : "no holder yet";

  // The contract is the mandate's factual I/O declaration — the Inputs and
  // Output columns render THIS, never the bare input_kind/output_kind
  // columns (which are null for most mandates and were reporting "—"/"text"
  // while the contract declared five required variables).
  const contract = parseMandateContract(contractOfMandate(mandate));
  const mandateKeyParts = splitMandateKey(mandate.mandate_key);

  // Context gating. The mandate's own gate is a column on the mandate; the
  // holder's is a column on its definition. Never report one as the other —
  // the console has to be able to say WHICH of the two closed the door.
  const contextGateClosed = mandate.auto_context_disabled === true;
  const holderContextClosed = agentId
    ? (data.agentsById[agentId]?.autoContextDisabled ?? false)
    : false;

  return {
    mandate,
    id: mandate.id,
    mandateKey: mandate.mandate_key,
    feature: mandateKeyParts.feature,
    mandateName: mandateKeyParts.mandate,
    label: mandate.label,
    agentId,
    agentName,
    agentType,
    pinnedVersionNumber,
    latestVersion,
    pinLabel,
    drift,
    health,
    codeTruth: codeTruth ?? null,
    inputKind: inputKindOfMandate(mandate) ?? "—",
    outputKind: mandate.output_kind ?? "text",
    requiredVariables: contract.requiredVariables,
    provisionKey: parseMandateWave1(mandate).provisionKey,
    draftInputDescriptions: draftInputDescriptions(mandate),
    holderDeclarations: agentId
      ? [
          ...(data.agentsById[agentId]?.variableNames ?? []),
          ...(data.agentsById[agentId]?.contextPolicyKeys ?? []),
        ]
      : [],
    requiredContextPolicyKeys: contract.requiredContextPolicyKeys,
    contextGateClosed,
    holderContextClosed,
    contextClosedEffective: holderContextClosed || contextGateClosed,
    requiredOutputKeys: contract.requiredOutputKeys,
    // 🚨 "user text only" is the truth ONLY when all FOUR input declarations
    // are empty. Three of them were invisible here until 2026-08-31: the
    // Provision (required_variables is stripped once one exists), the
    // mandate's OWN described inputs (the only declaration a user-authored
    // mandate has), and the bound Holder's declared variables. Arman authored
    // a mandate with five described inputs and a bound, mapped agent, and this
    // field still said "user text only".
    inputSummary: inputSummaryOf(mandate, contract.requiredVariables, agentId, data),
    outputSummary:
      mandate.output_kind ??
      (contract.requiredOutputKeys.length > 0
        ? contract.requiredOutputKeys.join(", ")
        : "unspecified"),
    overridesCount: (data.bindingsByMandateId[mandate.id] ?? []).length,
    isEnabled: Boolean(mandate.is_enabled),
    isPlaceholder:
      isJsonObject(mandate.metadata) &&
      mandate.metadata.migration_status === "placeholder",
    updatedAt: mandate.updated_at ?? null,
  };
}

export const HEALTH_CLASS: Record<MandateHealth, string> = {
  ok: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  // Neutral on purpose — this is the true resting state of a new mandate,
  // not a problem. Nothing red, nothing amber.
  "no holder yet": "text-muted-foreground border-border bg-muted/40",
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
export const HEALTH_HINT: Partial<Record<MandateHealth, string>> = {
  "code ↔ agent drift":
    "The calling code and the bound agent disagree about which variables exist. Values may be dropping before the prompt.",
  "code truth import failed":
    "aidream found the code declaration but could not import it, so this mandate cannot be verified from live code.",
  "code ↔ contract drift":
    "The live code declaration and the mandate's stored contract cache disagree. Code truth is authoritative.",
  "version drift":
    "A newer saved version of this agent exists — users keep getting the pinned one until the pin is updated.",
  "unresolved pin":
    "This mandate's agent could not be read — it may be another user's personal agent, or a deleted record. Rebind it to a system agent.",
  "not a system agent":
    "This mandate serves every user, but its default is a personal agent only some of them can see.",
  "agent archived": "The pinned agent is archived — rebind before it breaks.",
  "no holder yet":
    "Nothing is bound to this mandate yet, which is where every new mandate starts. Choose a holder above whenever the intelligence exists.",
};

// ── Drift remedy — which "newest" is real, and which button can reach it ─────

/**
 * What the drift panel may honestly offer.
 *
 * THE BUG THIS EXISTS TO KILL (2026-08-29, live case
 * `agent_factory.structure_builder`): the agent master counter said v9 while
 * the newest SAVED snapshot row was v8 — every save bumps the master, but a
 * snapshot row is only written for versions that were explicitly saved. The
 * panel took "newest" from the saved list and reported "current v8 / newest
 * v8" under a banner claiming a newer version exists. Newest is
 * max(master counter, newest saved); when the master is ahead, no pin can
 * reach it — only tracking latest runs the live definition.
 */
export interface DriftRemedy {
  /** The real newest version number — max(master counter, newest saved). */
  newestNumber: number | null;
  /** The newest SAVED snapshot — the only thing an explicit pin can target. */
  newestSavedNumber: number | null;
  /** The live definition is ahead of every saved snapshot. */
  liveAheadOfSaved: boolean;
  /** A pin update actually moves the mandate (a newer snapshot than the pin exists). */
  pinUpdateHelps: boolean;
}

export function resolveDriftRemedy(
  masterVersion: number | null,
  newestSavedNumber: number | null,
  pinnedNumber: number | null,
): DriftRemedy {
  const newestNumber =
    masterVersion === null && newestSavedNumber === null
      ? null
      : Math.max(masterVersion ?? 0, newestSavedNumber ?? 0);
  const liveAheadOfSaved =
    masterVersion !== null &&
    (newestSavedNumber === null || masterVersion > newestSavedNumber);
  const pinUpdateHelps =
    newestSavedNumber !== null &&
    pinnedNumber !== null &&
    newestSavedNumber > pinnedNumber;
  return { newestNumber, newestSavedNumber, liveAheadOfSaved, pinUpdateHelps };
}
