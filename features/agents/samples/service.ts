"use client";

/**
 * Agent samples ("test cases") service — direct supabase reads/writes on
 * agent.exemplar, the ONE agent-level sample-input store (generalized from the
 * mandate test bench 2026-08-25; the mandate bench in features/admin/mandates
 * reads the same table filtered by mandate_id).
 *
 * THE RAW-VALUES INVARIANT: a sample's `variables` + `user_input` are the exact
 * values as entered in the UI or sent programmatically — NEVER the merged
 * conversation snapshot. Borrowing from a real run therefore filters
 * chat.conversation.variables down to the capture-version's DECLARED variable
 * names and pulls the human text out of the reserved `__agent_user_input__`
 * key, instead of copying the merged dict (which carries scope/context values
 * the user never typed).
 *
 * Staleness is DERIVED, never stamped: a sample carries the contract hashes it
 * was captured/approved under; comparing them to the agent head's live hashes
 * at read time is the whole freshness story.
 */

import { createClient } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";

/** Server twin: USER_INPUT_VARIABLE_KEY in matrx_ai/agents/variable_kinds.py. */
const USER_INPUT_KEY = "__agent_user_input__";

export type AgentSampleRow = Database["agent"]["Tables"]["exemplar"]["Row"];

export interface AgentContractHead {
  agentId: string;
  version: number | null;
  inputContractHash: string | null;
  outputContractHash: string | null;
}

export type SampleFreshness =
  | "fresh"
  | "input-stale"
  | "output-stale"
  | "both-stale"
  | "unknown";

/** Derived at read time from the head hashes — never persisted. */
export function sampleFreshness(
  sample: Pick<AgentSampleRow, "input_contract_hash" | "output_contract_hash">,
  head: AgentContractHead | null,
): SampleFreshness {
  if (
    !head ||
    !head.inputContractHash ||
    !sample.input_contract_hash ||
    !sample.output_contract_hash
  ) {
    return "unknown";
  }
  const inputStale = sample.input_contract_hash !== head.inputContractHash;
  const outputStale = sample.output_contract_hash !== head.outputContractHash;
  if (inputStale && outputStale) return "both-stale";
  if (inputStale) return "input-stale";
  if (outputStale) return "output-stale";
  return "fresh";
}

export async function fetchAgentContractHead(
  agentId: string,
): Promise<AgentContractHead | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("definition")
    .select("id, version, input_contract_hash, output_contract_hash")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    agentId: data.id,
    version: data.version,
    inputContractHash: data.input_contract_hash,
    outputContractHash: data.output_contract_hash,
  };
}

export async function fetchAgentSamples(
  agentId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AgentSampleRow[]> {
  const supabase = createClient();
  let query = supabase
    .schema("agent")
    .from("exemplar")
    .select("*")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("status") // approved < candidate alphabetically — approved first
    .order("position")
    .order("created_at", { ascending: false });
  if (!options.includeArchived) query = query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Approve through the ONE RPC — it enforces the knob-governed cap
 * (agent_exemplars.max_approved_per_agent) and stamps the head's contract
 * hashes + version, because approval is a human confirmation that the sample
 * fits the CURRENT contract.
 */
export async function approveAgentSample(sampleId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("agx_exemplar_approve", {
    p_exemplar_id: sampleId,
  });
  if (error) throw error;
}

export async function setAgentSampleStatus(
  sampleId: string,
  status: "candidate" | "archived",
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("exemplar")
    .update({ status })
    .eq("id", sampleId);
  if (error) throw error;
}

export async function deleteAgentSample(sampleId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("exemplar")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sampleId);
  if (error) throw error;
}

export async function renameAgentSample(
  sampleId: string,
  label: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("agent")
    .from("exemplar")
    .update({ label })
    .eq("id", sampleId);
  if (error) throw error;
}

// ── Borrow from real runs ────────────────────────────────────────────────────

export interface CandidateRun {
  conversationId: string;
  title: string | null;
  createdAt: string;
  sourceFeature: string | null;
  /** The human-typed text (reserved key), for the list preview. */
  userInput: string | null;
  /** Declared-variable values only — the raw inputs a sample would keep. */
  variables: JsonObject;
  agentVersionId: string | null;
}

/** The values a sample keeps, recovered from a run per the raw-values invariant. */
function extractRawInputs(
  merged: unknown,
  declaredNames: ReadonlySet<string> | null,
): { variables: JsonObject; userInput: string | null } {
  if (!isJsonObject(merged)) return { variables: {}, userInput: null };
  const rawUserInput = merged[USER_INPUT_KEY];
  const variables: JsonObject = {};
  for (const [key, value] of Object.entries(merged)) {
    if (key === USER_INPUT_KEY) continue;
    // No declared list (definitions unavailable) => keep everything except the
    // reserved key, loudly imperfect rather than silently empty.
    if (declaredNames && !declaredNames.has(key)) continue;
    variables[key] = value;
  }
  return {
    variables,
    userInput: typeof rawUserInput === "string" ? rawUserInput : null,
  };
}

function declaredVariableNames(
  variableDefinitions: unknown,
): ReadonlySet<string> | null {
  if (!Array.isArray(variableDefinitions)) return null;
  const names = new Set<string>();
  for (const def of variableDefinitions) {
    if (isJsonObject(def) && typeof def.name === "string" && def.name.trim()) {
      names.add(def.name);
    }
  }
  return names;
}

/**
 * Recent real runs of this agent the CALLER can see (RLS scopes the read; the
 * default view is "mine" per THE VIEW LAW). Each row shows the raw inputs so
 * the human can judge before borrowing.
 */
export async function fetchCandidateRuns(
  agentId: string,
  options: { limit?: number } = {},
): Promise<CandidateRun[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select(
      "id, title, created_at, source_feature, variables, initial_agent_version_id",
    )
    .eq("initial_agent_id", agentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit ?? 25);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // One definitions lookup per distinct capture version — the declared-name
  // filter is what makes a borrowed sample raw instead of merged.
  const versionIds = [
    ...new Set(
      rows
        .map((row) => row.initial_agent_version_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const namesByVersionId = new Map<string, ReadonlySet<string> | null>();
  if (versionIds.length > 0) {
    const { data: versions, error: versionsError } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("id, variable_definitions")
      .in("id", versionIds);
    if (versionsError) throw versionsError;
    for (const version of versions ?? []) {
      namesByVersionId.set(
        version.id,
        declaredVariableNames(version.variable_definitions),
      );
    }
  }

  return rows.map((row) => {
    const declared = row.initial_agent_version_id
      ? (namesByVersionId.get(row.initial_agent_version_id) ?? null)
      : null;
    const { variables, userInput } = extractRawInputs(row.variables, declared);
    return {
      conversationId: row.id,
      title: row.title,
      createdAt: row.created_at,
      sourceFeature: row.source_feature,
      userInput,
      variables,
      agentVersionId: row.initial_agent_version_id,
    };
  });
}

/** The run's final assistant answer — the "end result" a borrower judges by. */
export async function fetchRunFinalResponse(
  conversationId: string,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const content = data?.content;
  if (content == null) return null;
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * Save one real run as a candidate sample. Inputs follow the raw-values
 * invariant; the reference output is the run's final assistant message; the
 * contract hashes + version come from the run's pinned definition version, so
 * staleness is judged against what the run ACTUALLY executed.
 */
export async function borrowSampleFromRun(input: {
  agentId: string;
  run: CandidateRun;
  label?: string;
}): Promise<AgentSampleRow> {
  const supabase = createClient();
  const organizationId = await ensureOrgId(null);

  let agentVersionNumber: number | null = null;
  let inputContractHash: string | null = null;
  let outputContractHash: string | null = null;
  if (input.run.agentVersionId) {
    const { data: version, error: versionError } = await supabase
      .schema("agent")
      .from("definition_version")
      .select("version_number, input_contract_hash, output_contract_hash")
      .eq("id", input.run.agentVersionId)
      .maybeSingle();
    if (versionError) throw versionError;
    agentVersionNumber = version?.version_number ?? null;
    inputContractHash = version?.input_contract_hash ?? null;
    outputContractHash = version?.output_contract_hash ?? null;
  }

  const referenceOutput = await fetchRunFinalResponse(input.run.conversationId);

  const { data, error } = await supabase
    .schema("agent")
    .from("exemplar")
    .insert({
      agent_id: input.agentId,
      label:
        input.label?.trim() ||
        input.run.title?.trim() ||
        `Borrowed run ${new Date(input.run.createdAt).toLocaleDateString()}`,
      variables: input.run.variables,
      user_input: input.run.userInput,
      reference_output: referenceOutput,
      source: "borrowed",
      status: "candidate",
      source_conversation_id: input.run.conversationId,
      agent_version: agentVersionNumber,
      input_contract_hash: inputContractHash,
      output_contract_hash: outputContractHash,
      visibility: "personal",
      organization_id: organizationId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
