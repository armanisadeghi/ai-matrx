/**
 * Mandate health model shared by the console table and the mandate workbench drawer.
 * `buildRow` derives one `MandateRow` per mandate from the console data bundle;
 * health is worst-first and drives both the table's Health column and the
 * drawer's status banner.
 */

import { isJsonObject } from "@/types/json";
import {
  AGENT_BASE_PATH,
  SYSTEM_AGENT_BASE_PATH,
  agentPathFor,
  type AgentAddressViewer,
} from "@/features/agents/addressing/agentAddress";
import { parseMandateContract } from "@/features/mandates/overrides";
import { missingOutputKeys } from "@/features/mandates/output-contract";
import {
  unmetContractChecks,
  type ContractMismatch,
} from "@/features/mandates/contract-check";
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
  | "workflow archived"
  | "code ↔ contract drift"
  | "output contract unmet"
  | "no Mandate Holder yet"
  | "ok";

/**
 * Stable worst-first order for both primary-health selection and table rows.
 *
 * 🚨 `no Mandate Holder yet` IS NOT A DEFECT and sorts beside `ok`, not with the red
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
  "workflow archived": 4,
  "code ↔ contract drift": 5,
  // 🚨 A HOLDER THAT CANNOT PRODUCE THE JOB'S REQUIRED OUTPUT KEYS IS NOT
  // "healthy" (walk of v0.4.1720, FIX-R4). `research_client.output_slides`
  // showed a RED "the assignment fails at run time" three inches above a GREEN
  // "Healthy — System agent, tracking the latest version", about the same
  // holder: this model simply did not know about the output half of the
  // contract, which `enforced_holder_contract` keeps in force ALWAYS. Ranked
  // above version drift because a drifted pin still runs and this does not.
  "output contract unmet": 5.5,
  "no Mandate Holder yet": 7,
  ok: 8,
};

/**
 * Where a given agent's record actually lives. System agents open in the
 * admin shell; personal agents open in the user shell. Both trees carry the
 * same sub-routes (/build, /run, /v, /surfaces …).
 */
export const SYSTEM_AGENT_BASE = SYSTEM_AGENT_BASE_PATH;
export const USER_AGENT_BASE = AGENT_BASE_PATH;

/**
 * Where this agent opens. Delegates to the ONE address rule
 * (`features/agents/addressing/agentAddress.ts`) — this was one of three
 * competing implementations before 2026-09-08 and is kept only as the
 * mandate console's import name.
 */
export function agentHref(
  id: string,
  agentType: string | null,
  sub = "",
  viewer?: AgentAddressViewer,
): string {
  return agentPathFor({ agentId: id, agentType }, sub, viewer);
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
  /**
   * `agent.definition.version` — an optimistic-concurrency COUNTER that every
   * write bumps, snapshot or not (R36 / CONTRACT Amendment 3b: it read 33 with
   * newest snapshot 30 on Quick Test Agent, content-identical). It is NOT a
   * version and is never printed as one; "latest" everywhere is the newest
   * SNAPSHOT's `version_number` (R7).
   */
  liveCounter: number | null;
  /**
   * The newest SAVED snapshot's version number, when the caller knows it
   * (the console hands it over from the impact read's `latest_version_number`;
   * the detail panel reads the version list itself). Null = unknown, never
   * "current".
   */
  newestSnapshotVersion: number | null;
  pinLabel: string;
  /** "v7 → v9" when the pin trails the newest SAVED snapshot; null when unknown. */
  drift: string | null;
  health: MandateHealth;
  /**
   * 🚨 EVERY RED HOLDER ON THIS JOB — its default and each binding saved with
   * an unmet contract (server-persisted, `metadata.contract_check`). A
   * mismatch never blocks a save (Arman, 2026-09-25); it is shown here, loud.
   */
  contractMismatches: ContractMismatch[];
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
  /**
   * The bound holder's declared `output_schema`, by agent id, when the caller
   * has read it (`fetchAgentOutputSchemas`). **Absent means UNKNOWN, never
   * "fine"** — only a caller that HAS read the schema can report `output
   * contract unmet`.
   *
   * Passing this explicitly is for a caller with a FRESHER read than the
   * console load carries — the single-mandate admin page, which fetches the one
   * holder's schema directly. Every LIST caller can now leave it out: the
   * console load reads `output_schema` on the by-id agent query it was already
   * making and hands it over as `data.outputSchemas`, which is used when this
   * argument is omitted. That closes FIX-R4's second finding — the list
   * reported `ok` for a holder that cannot produce the required keys while the
   * single-mandate page called the same holder broken.
   */
  outputSchemas?: Record<string, unknown>,
  /**
   * The newest SAVED snapshot number per agent id, when the caller has read
   * it (the console: from the impact verdicts). Absent = unknown: no drift
   * sentence is composed, because the counter is not a version (D10).
   */
  newestSnapshotByAgent?: Record<string, number | null>,
): MandateRow {
  let agentId: string | null = null;
  let agentName = "(unknown agent)";
  let agentType: string | null = null;
  let pinnedVersionNumber: number | null = null;
  let pinnedVersionDeclarations: string[] | null = null;
  let liveCounter: number | null = null;
  let newestSnapshotVersion: number | null = null;
  let pinLabel = "latest";
  let drift: string | null = null;
  let nonSystem = false;
  let archived = false;

  const holder = holderOfMandate(mandate);
  // 🚨 WORKFLOW PARITY (2026-09-25): a job a WORKFLOW holds is not an agent
  // this console failed to read. Every agent-derived verdict below (unresolved
  // pin, not a system agent, output schema, code ↔ agent drift) read the
  // workflow id as an agent id, found nothing, and called every workflow-held
  // job "unresolved pin" — on the list, the peek and the dashboard counts.
  const isWorkflowHolder = holder.holderType === "workflow";
  const workflow = isWorkflowHolder && holder.holderId
    ? (data.workflowsById?.[holder.holderId] ?? null)
    : null;
  if (isWorkflowHolder) {
    const pin = holder.versionId
      ? data.workflowVersionsById?.[holder.versionId]
      : undefined;
    agentName = workflow?.name ?? "(workflow)";
    pinnedVersionNumber = pin?.versionNumber ?? null;
    pinLabel = holder.versionId
      ? pin
        ? `v${pin.versionNumber}`
        : "unknown version"
      : "latest";
    archived = Boolean(workflow?.isArchived);
  } else if (holder.versionId) {
    const version = data.versionsById[holder.versionId];
    const agent = version?.agentId
      ? data.agentsById[version.agentId]
      : undefined;
    const pinned = version?.versionNumber ?? null;
    if (version?.variableNames || version?.contextPolicyKeys) {
      pinnedVersionDeclarations = [
        ...(version.variableNames ?? []),
        ...(version.contextPolicyKeys ?? []),
      ];
    }
    agentId = agent?.id ?? version?.agentId ?? null;
    agentName = agent?.name ?? version?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    pinnedVersionNumber = pinned;
    liveCounter = agent?.version ?? null;
    newestSnapshotVersion = agentId ? (newestSnapshotByAgent?.[agentId] ?? null) : null;
    // The column header already says "Pin" — the value is just the version.
    pinLabel = pinned != null ? `v${pinned}` : "unknown version";
    // Drift is judged against the newest SAVED snapshot only — never the
    // counter (D10). Unknown newest = no claim.
    if (pinned != null && newestSnapshotVersion != null && newestSnapshotVersion > pinned)
      drift = `v${pinned} → v${newestSnapshotVersion}`;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  } else {
    const agent = holder.holderId
      ? data.agentsById[holder.holderId]
      : undefined;
    agentId = agent?.id ?? holder.holderId ?? null;
    agentName = agent?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    liveCounter = agent?.version ?? null;
    newestSnapshotVersion = agentId ? (newestSnapshotByAgent?.[agentId] ?? null) : null;
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
  // A workflow the console could not read is unresolved too — same rule.
  const unresolved = isWorkflowHolder
    ? hasPin && workflow === null
    : hasPin && (agentId == null || agentType == null);

  // Code ↔ AGENT drift compares the code declaration to the BOUND agent. With
  // nothing bound there is no second side, so the comparison cannot be made.
  const codeAgentDrift =
    !isWorkflowHolder &&
    hasPin &&
    codeTruth?.resolution === "code_declaration_found" &&
    codeTruth.bound_agent_drift != null &&
    codeTruth.bound_agent_drift !== "match";
  const codeContractDrift =
    codeTruth?.resolution === "code_declaration_found" &&
    codeTruth.drift !== "match";
  const codeImportFailed =
    codeTruth?.resolution === "code_exists_but_import_failed";

  // THE OUTPUT HALF OF THE CONTRACT — in force always (aidream
  // `enforced_holder_contract`), judged by the SHARED mirror of the server's
  // rule so this console and the binding pre-flight cannot disagree.
  const contractForOutput = parseMandateContract(contractOfMandate(mandate));
  // An explicit map wins (a caller with a fresher read of one holder); otherwise
  // the console load's own read answers. Neither present = UNKNOWN, unchanged.
  const schemas = outputSchemas ?? data.outputSchemas;
  const contractMismatches = unmetContractChecks(
    mandate,
    data.bindingsByMandateId[mandate.id] ?? [],
  );
  const defaultSavedRed = contractMismatches.some(
    (m) => m.where === "The job's default",
  );
  const outputContractUnmet =
    defaultSavedRed ||
    (hasPin &&
    agentId !== null &&
    schemas !== undefined &&
    agentId in schemas &&
    contractForOutput.requiredOutputKeys.length > 0 &&
    missingOutputKeys(contractForOutput.requiredOutputKeys, schemas[agentId])
      .length > 0);

  const health: MandateHealth = codeAgentDrift
    ? "code ↔ agent drift"
    : codeImportFailed
      ? "code truth import failed"
      : unresolved
        ? "unresolved pin"
        : nonSystem
          ? "not a system agent"
          : archived
            ? isWorkflowHolder
              ? "workflow archived"
              : "agent archived"
            : codeContractDrift
              ? "code ↔ contract drift"
              : outputContractUnmet
                ? "output contract unmet"
                : hasPin
                  ? "ok"
                  : "no Mandate Holder yet";

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
    liveCounter,
    newestSnapshotVersion,
    pinLabel,
    drift,
    health,
    contractMismatches,
    codeTruth: codeTruth ?? null,
    inputKind: inputKindOfMandate(mandate) ?? "—",
    outputKind: mandate.output_kind ?? "text",
    requiredVariables: contract.requiredVariables,
    provisionKey: parseMandateWave1(mandate).provisionKey,
    draftInputDescriptions: draftInputDescriptions(mandate),
    // A PINNED version answers with ITS declarations — the ones the job runs
    // with and the server's input surface serves — never the live agent's.
    holderDeclarations: pinnedVersionDeclarations ??
      (agentId
        ? [
            ...(data.agentsById[agentId]?.variableNames ?? []),
            ...(data.agentsById[agentId]?.contextPolicyKeys ?? []),
          ]
        : []),
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
  ok: "text-success border-success/40 bg-success/10",
  // Neutral on purpose — this is the true resting state of a new mandate,
  // not a problem. Nothing red, nothing amber.
  "no Mandate Holder yet": "text-muted-foreground border-border bg-muted/40",
  "code ↔ agent drift": "text-foreground border-destructive/40 bg-destructive/10",
  "code truth import failed":
    "text-foreground border-warning/40 bg-warning/10",
  "code ↔ contract drift": "text-foreground border-warning/40 bg-warning/10",
  "output contract unmet": "text-foreground border-destructive/40 bg-destructive/10",
  "agent archived": "text-foreground border-destructive/40 bg-destructive/10",
  "workflow archived": "text-foreground border-destructive/40 bg-destructive/10",
  "not a system agent": "text-foreground border-destructive/40 bg-destructive/10",
  "unresolved pin": "text-foreground border-destructive/40 bg-destructive/10",
};

/** What the admin should do about each unhealthy state — shown, not implied. */
export const HEALTH_HINT: Partial<Record<MandateHealth, string>> = {
  "code ↔ agent drift":
    "The calling code and the bound agent disagree about which variables exist. Values may be dropping before the prompt.",
  "code truth import failed":
    "aidream found the code declaration but could not import it, so this mandate cannot be verified from live code.",
  "code ↔ contract drift":
    "The live code declaration and the mandate's stored contract cache disagree. Code truth is authoritative.",
  "unresolved pin":
    "This mandate's Mandate Holder could not be read — it may be another user's personal agent, or a deleted record. Rebind it to a system agent.",
  "not a system agent":
    "This mandate serves every user, but its default is a personal agent only some of them can see.",
  "agent archived": "The pinned agent is archived — rebind before it breaks.",
  "workflow archived":
    "The workflow holding this job is archived — un-archive it or bind another before it breaks.",
  "output contract unmet":
    "The Mandate Holder does not declare the structured output keys this job's consumers require, so the assignment fails at run time. Give the Mandate Holder an output schema that declares them, or bind one that already does.",
  "no Mandate Holder yet":
    "Nothing is bound to this mandate yet, which is where every new mandate starts. Choose a Mandate Holder above whenever the intelligence exists.",
};

// ── Drift remedy — which "newest" is real, and which button can reach it ─────

/**
 * What the drift panel may honestly offer.
 *
 * "Newest" is the newest SAVED snapshot and nothing else (R7; CONTRACT
 * Amendment 3b). This used to fold in `agent.definition.version` as
 * "max(master counter, newest saved)" and claim "live, unsnapshotted" whenever
 * the counter was ahead — but that counter bumps on every write, snapshot or
 * not, and R36 measured the claim false on all four live rows it made
 * (content key-for-key identical to the newest snapshot). Whether the live
 * definition is really ahead of every snapshot is the SERVER's content-based
 * `unreachable` blocker; a screen never derives it from the counter.
 */
export interface DriftRemedy {
  /** The newest SAVED snapshot — what "latest" means everywhere. */
  newestNumber: number | null;
  /** Same fact under its explicit name; kept so callers read as they did. */
  newestSavedNumber: number | null;
  /** A pin update actually moves the mandate (a newer snapshot than the pin exists). */
  pinUpdateHelps: boolean;
}

export function resolveDriftRemedy(
  newestSavedNumber: number | null,
  pinnedNumber: number | null,
): DriftRemedy {
  const pinUpdateHelps =
    newestSavedNumber !== null &&
    pinnedNumber !== null &&
    newestSavedNumber > pinnedNumber;
  return { newestNumber: newestSavedNumber, newestSavedNumber, pinUpdateHelps };
}
