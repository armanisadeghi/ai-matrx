/**
 * Agent Factory builds — reads straight from the execution spine (React →
 * Supabase; the platform-admin read policy on `runtime.*` is what lets the
 * admin seat see every build), and the ONE write (start a build) through
 * aidream's `POST /agent-factory/builds`, because a build is server work.
 *
 * Reads never go through `GET /agent-factory/builds/{id}`: it returns the same
 * latest checkpoint this reads directly (data-flow law: the Python server is
 * not a DB gateway).
 */

import { createClient } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { postJson } from "@/lib/python-client";
import type { FactoryBuildDetail, FactoryBuildRow, FactoryBuildState } from "./types";

export const AGENT_FACTORY_BUILD_TYPE = "agent_factory_build";
/** Newest builds the list loads. Builds are minutes-long jobs; this is weeks of them. */
export const FACTORY_BUILD_LIST_CAP = 200;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

interface CheckpointSummary {
  created_at: string;
  status: unknown;
  current_step: unknown;
  outcome: unknown;
  send_backs: unknown;
  agent_id: unknown;
  mandate_key: unknown;
  name: unknown;
  display_name: unknown;
  verdict: unknown;
  error: unknown;
}

/**
 * Each build with only the facts the list shows, read as JSON paths off its
 * newest checkpoint (one embedded row) — never the whole multi-KB state.
 * Typed as `string` on purpose: the JSON-path select is past what the
 * generated select parser can instantiate (TS2589); the row is read below.
 */
const LIST_SELECT: string =
  "id, status, created_at, started_at, ended_at, global_execution_checkpoint(created_at, status:state->>status, current_step:state->>current_step, outcome:state->>outcome, send_backs:state->send_backs, agent_id:state->>agent_id, mandate_key:state->request->>mandate_key, name:state->request->spec->>name, display_name:state->request->spec->>display_name, verdict:state->steps->proof_review->answer->>verdict, error:state->>error)";

interface ListRow {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  global_execution_checkpoint: CheckpointSummary[] | null;
}

export async function listFactoryBuilds(
  signal?: AbortSignal,
): Promise<{ rows: FactoryBuildRow[]; total: number | null }> {
  const supabase = createClient();
  let query = supabase
    .schema("runtime")
    .from("global_execution")
    .select(LIST_SELECT, { count: "exact" })
    .eq("type", AGENT_FACTORY_BUILD_TYPE)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "global_execution_checkpoint", ascending: false })
    .limit(1, { referencedTable: "global_execution_checkpoint" })
    .limit(FACTORY_BUILD_LIST_CAP);
  if (signal) query = query.abortSignal(signal);
  const { data, error, count } = await query;
  if (error) throw operationFailed("load the Agent Factory builds", error);
  const rows = ((data ?? []) as unknown as ListRow[]).map((row) => {
    const checkpoints = row.global_execution_checkpoint ?? [];
    const cp = checkpoints[0];
    const sendBacks = cp && typeof cp.send_backs === "number" ? cp.send_backs : 0;
    return {
      id: row.id,
      spineStatus: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      mandateKey: str(cp?.mandate_key),
      name: str(cp?.display_name) ?? str(cp?.name),
      currentStep: str(cp?.current_step),
      outcome: str(cp?.outcome),
      sendBacks,
      verdict: str(cp?.verdict),
      agentId: str(cp?.agent_id),
      error: str(cp?.error),
    };
  });
  return { rows, total: count ?? null };
}

export async function getFactoryBuild(buildId: string, signal?: AbortSignal): Promise<FactoryBuildDetail | null> {
  const supabase = createClient();
  let execQuery = supabase
    .schema("runtime")
    .from("global_execution")
    .select("id, status, created_at, started_at, ended_at")
    .eq("id", buildId)
    .eq("type", AGENT_FACTORY_BUILD_TYPE);
  if (signal) execQuery = execQuery.abortSignal(signal);
  const { data: exec, error: execError } = await execQuery.maybeSingle();
  if (execError) throw operationFailed("load the Agent Factory build", execError);
  if (!exec) return null;

  let cpQuery = supabase
    .schema("runtime")
    .from("global_execution_checkpoint")
    .select("state, created_at")
    .eq("execution_id", buildId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (signal) cpQuery = cpQuery.abortSignal(signal);
  const { data: cp, error: cpError } = await cpQuery.maybeSingle();
  if (cpError) throw operationFailed("load the Agent Factory build's progress", cpError);

  return {
    id: exec.id,
    spineStatus: exec.status,
    createdAt: exec.created_at,
    startedAt: exec.started_at,
    endedAt: exec.ended_at,
    checkpointAt: cp?.created_at ?? null,
    state: (cp?.state ?? null) as FactoryBuildState | null,
  };
}

/** Which of these step conversations were kept (a system run may keep none). */
export async function keptConversationIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select("id")
    .in("id", unique);
  if (error) throw operationFailed("check the step conversations", error);
  return new Set((data ?? []).map((r) => r.id));
}

export interface FactoryMandateOption {
  key: string;
  label: string;
  outputKind: string | null;
  hasHolder: boolean;
}

/**
 * Mandates a build can target. Every live mandate is offered; one with no
 * Holder is marked (the brief: "ignore things that have mandates and they
 * simply don't have agents yet" — they stay pickable, never hidden).
 */
export async function listFactoryMandates(): Promise<FactoryMandateOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("mandate")
    .from("definition")
    .select("mandate_key, label, output_kind, default_holder_id")
    .is("deleted_at", null)
    .order("mandate_key", { ascending: true })
    .limit(2000);
  if (error) throw operationFailed("load the mandates", error);
  return (data ?? []).map((m) => ({
    key: m.mandate_key,
    label: m.label ?? m.mandate_key,
    outputKind: m.output_kind ?? null,
    hasHolder: Boolean(m.default_holder_id),
  }));
}

export interface StartFactoryBuildInput {
  mandateKey: string;
  /** Caller lock: the model the built agent must use. */
  modelId?: string | null;
}

/** POST /agent-factory/builds → the new build id (202; the build runs detached). */
export async function startFactoryBuild(input: StartFactoryBuildInput): Promise<string> {
  const slug = input.mandateKey.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const body = {
    spec: {
      name: `${slug}_factory`,
      display_name: `${input.mandateKey} (Agent Factory build)`,
      ...(input.modelId ? { model_id: input.modelId } : {}),
    },
    mandate_key: input.mandateKey,
    idempotency_key: `admin-factory:${input.mandateKey}:${crypto.randomUUID()}`,
  };
  const { data } = await postJson<{ build_id: string }>("/agent-factory/builds", body);
  if (!data?.build_id) throw new Error("The Agent Factory did not return a build id");
  return data.build_id;
}
