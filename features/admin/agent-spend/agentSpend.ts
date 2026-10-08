/**
 * features/admin/agent-spend/agentSpend.ts
 *
 * THE read path for "AI spend health" — what every agent and mandate costs and how it
 * behaves, from three read-only, permission-checked RPCs in `platform` (all built on the
 * private `platform._agent_spend_facts`, which attributes every settled execution in
 * `runtime._ai_usage_execution_facts` to an agent and/or mandate — including replay turns
 * sent with store:false, which have no saved conversation):
 *   - platform.agent_spend_health(p_org_id, p_days) — one row per (agent, mandate);
 *   - platform.agent_spend_runs(p_org_id, p_days, p_agent_id, p_mandate_key) — every run;
 *   - platform.conversation_spend(p_conversation_id) — every billed call of one conversation.
 * p_org_id null = every organization (super admin); set = that organization (its admins).
 *
 * Red flags reuse the owner's spend rules (common-docs/policies/ai-model-and-spend-rules.md)
 * via SPEND_FLAG_LIMITS, shared with the automation cost pages.
 */
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import { SPEND_FLAG_LIMITS, agentHref, mandateHref, orgMandateHref } from "@/features/scheduling/service/automationCosts";

export type SpendSeat = "admin" | "org";
export type SpendWindowDays = 7 | 30;

export interface SpendPayer {
  person_id: string | null;
  email: string | null;
  is_platform_admin: boolean;
  cost: number;
}

export interface SpendOrg {
  id: string | null;
  name: string | null;
  is_system: boolean;
  cost: number;
}

export interface AgentSpendRow {
  agent_id: string | null;
  agent_name: string | null;
  agent_type: string | null;
  mandate_key: string | null;
  mandate_label: string | null;
  models: string[];
  premium_models: string[];
  runs: number;
  unsaved_runs: number;
  unsaved_cost: number;
  automated_runs: number;
  cost: number;
  avg_run_cost: number;
  max_run_cost: number;
  avg_turns: number;
  max_turns: number;
  calls: number;
  avg_input_per_call: number;
  avg_output_per_call: number;
  last_run_at: string | null;
  payers: SpendPayer[];
  organizations: SpendOrg[];
}

export interface AgentSpendRun {
  run_key: string;
  started_at: string;
  cost: number;
  turns: number;
  calls: number;
  models: string[];
  tokens_in: number;
  tokens_out: number;
  automated: boolean;
  origin: string | null;
  saved: boolean;
  person_id: string | null;
  person_email: string | null;
  organization_id: string | null;
  organization_name: string | null;
  conversation_id: string | null;
  request_id: string | null;
  agent_id: string | null;
  mandate_key: string | null;
}

export interface ConversationSpendCall {
  execution_id: string;
  created_at: string;
  request_id: string | null;
  model: string | null;
  cost: number;
  tokens_in: number;
  tokens_out: number;
  tokens_cached: number;
  calls: number;
  iterations: number;
  agent_id: string | null;
  mandate_key: string | null;
  automated: boolean;
  saved: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function asList<T>(v: unknown, map: (r: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => (x && typeof x === "object" ? [map(x as Record<string, unknown>)] : []));
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export async function fetchAgentSpend(orgId: string | null, days: SpendWindowDays): Promise<AgentSpendRow[]> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("agent_spend_health", { p_org_id: orgId ?? undefined, p_days: days });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    agent_id: r.agent_id,
    agent_name: r.agent_name,
    agent_type: r.agent_type,
    mandate_key: r.mandate_key,
    mandate_label: r.mandate_label,
    models: r.models ?? [],
    premium_models: r.premium_models ?? [],
    runs: num(r.runs),
    unsaved_runs: num(r.unsaved_runs),
    unsaved_cost: num(r.unsaved_cost),
    automated_runs: num(r.automated_runs),
    cost: num(r.cost),
    avg_run_cost: num(r.avg_run_cost),
    max_run_cost: num(r.max_run_cost),
    avg_turns: num(r.avg_turns),
    max_turns: num(r.max_turns),
    calls: num(r.calls),
    avg_input_per_call: num(r.avg_input_per_call),
    avg_output_per_call: num(r.avg_output_per_call),
    last_run_at: r.last_run_at,
    payers: asList(r.payers, (p) => ({
      person_id: str(p.person_id),
      email: str(p.email),
      is_platform_admin: p.is_platform_admin === true,
      cost: num(p.cost),
    })),
    organizations: asList(r.organizations, (o) => ({
      id: str(o.id),
      name: str(o.name),
      is_system: o.is_system === true,
      cost: num(o.cost),
    })),
  }));
}

export async function fetchAgentSpendRuns(
  orgId: string | null,
  days: SpendWindowDays,
  agentId: string | null,
  mandateKey: string | null,
): Promise<AgentSpendRun[]> {
  const { data, error } = await supabase.schema("platform").rpc("agent_spend_runs", {
    p_org_id: orgId ?? undefined,
    p_days: days,
    p_agent_id: agentId ?? undefined,
    p_mandate_key: mandateKey ?? undefined,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    run_key: r.run_key,
    started_at: r.started_at,
    cost: num(r.cost),
    turns: num(r.turns),
    calls: num(r.calls),
    models: r.models ?? [],
    tokens_in: num(r.tokens_in),
    tokens_out: num(r.tokens_out),
    automated: r.automated === true,
    origin: r.origin,
    saved: r.saved === true,
    person_id: r.person_id,
    person_email: r.person_email,
    organization_id: r.organization_id,
    organization_name: r.organization_name,
    conversation_id: r.conversation_id,
    request_id: r.request_id,
    agent_id: r.agent_id,
    mandate_key: r.mandate_key,
  }));
}

export async function fetchConversationSpend(conversationId: string): Promise<ConversationSpendCall[]> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("conversation_spend", { p_conversation_id: conversationId });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    execution_id: r.execution_id,
    created_at: r.created_at,
    request_id: r.request_id,
    model: r.model,
    cost: num(r.cost),
    tokens_in: num(r.tokens_in),
    tokens_out: num(r.tokens_out),
    tokens_cached: num(r.tokens_cached),
    calls: num(r.calls),
    iterations: num(r.iterations),
    agent_id: r.agent_id,
    mandate_key: r.mandate_key,
    automated: r.automated === true,
    saved: r.saved === true,
  }));
}

// ── Red flags ───────────────────────────────────────────────────────────────

/** Input tokens per model call above which a context is "huge" (agent-chosen start, 2026-10-08). */
export const HUGE_CONTEXT_TOKENS = 50_000;
/** Average output tokens per call below which a premium model is doing short work. */
export const SHORT_OUTPUT_TOKENS = 400;
/** The platform's shared test accounts — spend parked here belongs to nobody. */
export const TEST_ACCOUNT_EMAILS = ["admin@admin.com", "test@test.com"] as const;

export type SpendFlagId =
  | "automated"
  | "premium_model"
  | "avg_run_over_limit"
  | "run_over_limit"
  | "avg_turns_over_limit"
  | "max_turns_over_limit"
  | "premium_short_output"
  | "huge_context"
  | "parked_on_admin"
  | "unsaved_runs";

export interface SpendFlag {
  id: SpendFlagId;
  label: string;
  detail: string;
  severity: "critical" | "warning";
}

const isTestOrAdmin = (p: SpendPayer) =>
  p.is_platform_admin || (p.email != null && (TEST_ACCOUNT_EMAILS as readonly string[]).includes(p.email));

/** `money` is the viewer's cost formatter (useCostDisplay().format): points, or $ for an admin who chose it. */
export function agentSpendFlags(row: AgentSpendRow, money: (usd: number) => string): SpendFlag[] {
  const L = SPEND_FLAG_LIMITS;
  const limit = money(L.runCostUsd);
  const flags: SpendFlag[] = [];
  const premium = row.premium_models.length > 0;
  if (premium) {
    flags.push({ id: "premium_model", label: "Premium model", detail: `Uses ${row.premium_models.join(", ")}`, severity: "critical" });
  }
  if (row.avg_run_cost > L.runCostUsd) {
    flags.push({ id: "avg_run_over_limit", label: `Avg run > ${limit}`, detail: `Average run costs ${money(row.avg_run_cost)}`, severity: "critical" });
  }
  if (row.max_run_cost > L.runCostUsd) {
    flags.push({ id: "run_over_limit", label: `A run > ${limit}`, detail: `Most expensive run cost ${money(row.max_run_cost)}`, severity: "warning" });
  }
  if (row.avg_turns > L.avgTurns) {
    flags.push({ id: "avg_turns_over_limit", label: `Avg turns > ${L.avgTurns}`, detail: `${row.avg_turns} model calls per run on average`, severity: "critical" });
  }
  if (row.max_turns > L.maxTurns) {
    flags.push({ id: "max_turns_over_limit", label: `Max turns > ${L.maxTurns}`, detail: `One run made ${row.max_turns} model calls`, severity: "warning" });
  }
  if (premium && row.calls > 0 && row.avg_output_per_call < SHORT_OUTPUT_TOKENS) {
    flags.push({ id: "premium_short_output", label: "Premium, short replies", detail: `Premium model writing ${row.avg_output_per_call} tokens per call on average`, severity: "critical" });
  }
  if (row.avg_input_per_call > HUGE_CONTEXT_TOKENS) {
    flags.push({ id: "huge_context", label: "Huge context", detail: `${Math.round(row.avg_input_per_call).toLocaleString()} input tokens per call on average`, severity: "warning" });
  }
  if (row.automated_runs > 0 && flags.length > 0) {
    flags.unshift({ id: "automated", label: "Automated", detail: `${row.automated_runs} of ${row.runs} runs started with nobody pressing a button`, severity: "critical" });
  }
  const parked = row.payers.filter(isTestOrAdmin);
  if (parked.length > 0) {
    const cost = parked.reduce((s, p) => s + p.cost, 0);
    flags.push({ id: "parked_on_admin", label: "Admin/test account", detail: `${money(cost)} billed to ${parked.map((p) => p.email ?? "an admin").join(", ")}`, severity: "warning" });
  }
  if (row.unsaved_runs > 0) {
    flags.push({ id: "unsaved_runs", label: "Unsaved runs", detail: `${row.unsaved_runs} runs (${money(row.unsaved_cost)}) left no saved conversation`, severity: "warning" });
  }
  return flags;
}

// ── Doors ───────────────────────────────────────────────────────────────────

export const AGENT_SPEND_ADMIN_PATH = "/administration/usage/agents";
export const orgAgentSpendPath = (orgSlug: string) => `/organizations/${orgSlug}/admin/ai-spend`;

/** One (agent, mandate) pair's detail page, by seat. */
export function agentSpendDetailHref(
  row: Pick<AgentSpendRow, "agent_id" | "mandate_key">,
  days: SpendWindowDays,
  seat: SpendSeat,
  orgSlug?: string,
): string {
  const p = new URLSearchParams();
  if (row.agent_id) p.set("agent", row.agent_id);
  if (row.mandate_key) p.set("mandate", row.mandate_key);
  p.set("days", String(days));
  const base = seat === "org" && orgSlug ? orgAgentSpendPath(orgSlug) : AGENT_SPEND_ADMIN_PATH;
  return `${base}/detail?${p.toString()}`;
}

/** The agent's own admin page (system agents: the builder). */
export function spendAgentHref(row: Pick<AgentSpendRow, "agent_id" | "agent_name" | "agent_type">): string | null {
  if (!row.agent_id) return null;
  return agentHref({ id: row.agent_id, name: row.agent_name ?? row.agent_id, agent_type: row.agent_type }, "admin");
}

export function spendMandateHref(key: string, seat: SpendSeat, orgSlug?: string): string {
  return seat === "org" && orgSlug ? orgMandateHref(orgSlug, key) : mandateHref(key);
}

export const parseWindow = (v: string | null | undefined): SpendWindowDays => (v === "7" ? 7 : 30);
