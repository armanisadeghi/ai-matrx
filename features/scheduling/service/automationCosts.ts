/**
 * features/scheduling/service/automationCosts.ts
 *
 * THE read path for what every automation costs and how it behaves — one
 * SECURITY DEFINER rollup in the database (`scheduler.automation_cost_rollup`
 * + `scheduler.automation_cost_runs`) shared by every seat:
 *   - system admin (admin lane): every organization's automations
 *     (/administration/automation/scheduling/costs and the System jobs tab);
 *   - org admin: their own organization's automations (/organizations/<org>/admin).
 *
 * An automation is a scheduled task, a scheduled agent, a recurring mandate
 * (scheduler.sch_task) or a workflow trigger (workflow.trigger). Cost comes from
 * the settled-execution facts of each run's execution tree; models, turns
 * (model calls per run), agents and mandates come from the run's chat requests.
 *
 * The red flags are the owner's spend rules
 * (common-docs/policies/ai-model-and-spend-rules.md) and are computed here, once.
 */
import { supabase } from "@/utils/supabase/client";
import { schedulerDb } from "@/utils/supabase/schedulerDb";
import { pgErrorToError } from "@ai-matrx/data";

export type AutomationKind =
  | "scheduled_task"
  | "scheduled_agent"
  | "recurring_mandate"
  | "workflow_trigger";

export const AUTOMATION_KIND_LABEL: Record<AutomationKind, string> = {
  scheduled_task: "Scheduled task",
  scheduled_agent: "Scheduled agent",
  recurring_mandate: "Recurring mandate",
  workflow_trigger: "Workflow trigger",
};

export interface AutomationAgentRef {
  id: string;
  name: string;
  agent_type: string | null;
}

export interface AutomationCostRow {
  automation_kind: AutomationKind;
  automation_id: string;
  name: string;
  description: string | null;
  trigger_type: string | null;
  trigger_config: Record<string, unknown> | null;
  enabled: boolean;
  approval: string | null;
  approved_by: string | null;
  approved_at: string | null;
  owner_user_id: string | null;
  owner_email: string | null;
  owner_is_platform_admin: boolean;
  organization_id: string | null;
  organization_name: string | null;
  organization_is_system: boolean;
  workflow_definition_id: string | null;
  runs: number;
  runs_7d: number;
  cost: number;
  cost_7d: number;
  last_run_at: string | null;
  last_run_cost: number | null;
  avg_run_cost: number | null;
  max_run_cost: number | null;
  est_monthly_cost: number;
  avg_turns: number;
  max_turns: number;
  max_loop: number;
  models: string[];
  premium_models: string[];
  agents: AutomationAgentRef[];
  mandates: string[];
}

export interface AutomationRunCost {
  run_id: string;
  run_at: string;
  status: string | null;
  cost: number;
  turns: number;
  max_loop: number;
  models: string[];
  agent_ids: string[];
  mandates: string[];
  conversation_id: string | null;
  workflow_run_id: string | null;
}

/** The window every number on these surfaces covers. */
export const AUTOMATION_COST_WINDOW_DAYS = 30;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : num(v);
}

function asAgents(v: unknown): AutomationAgentRef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const r = a as Record<string, unknown>;
    if (typeof r.id !== "string") return [];
    return [
      {
        id: r.id,
        name: typeof r.name === "string" ? r.name : r.id,
        agent_type: typeof r.agent_type === "string" ? r.agent_type : null,
      },
    ];
  });
}

/**
 * Every automation the caller may see. `orgId` null = every organization (super
 * admin, admin lane only); an id = that organization (its admins).
 */
export async function fetchAutomationCosts(
  orgId: string | null,
  days: number = AUTOMATION_COST_WINDOW_DAYS,
): Promise<AutomationCostRow[]> {
  const { data, error } = await schedulerDb(supabase).rpc("automation_cost_rollup", {
    p_org_id: orgId ?? undefined,
    p_days: days,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    automation_kind: r.automation_kind as AutomationKind,
    automation_id: r.automation_id,
    name: r.name,
    description: r.description,
    trigger_type: r.trigger_type,
    trigger_config:
      r.trigger_config && typeof r.trigger_config === "object" && !Array.isArray(r.trigger_config)
        ? (r.trigger_config as Record<string, unknown>)
        : null,
    enabled: r.enabled,
    approval: r.approval,
    approved_by: r.approved_by,
    approved_at: r.approved_at,
    owner_user_id: r.owner_user_id,
    owner_email: r.owner_email,
    owner_is_platform_admin: r.owner_is_platform_admin,
    organization_id: r.organization_id,
    organization_name: r.organization_name,
    organization_is_system: r.organization_is_system,
    workflow_definition_id: r.workflow_definition_id,
    runs: num(r.runs),
    runs_7d: num(r.runs_7d),
    cost: num(r.cost),
    cost_7d: num(r.cost_7d),
    last_run_at: r.last_run_at,
    last_run_cost: numOrNull(r.last_run_cost),
    avg_run_cost: numOrNull(r.avg_run_cost),
    max_run_cost: numOrNull(r.max_run_cost),
    est_monthly_cost: num(r.est_monthly_cost),
    avg_turns: num(r.avg_turns),
    max_turns: num(r.max_turns),
    max_loop: num(r.max_loop),
    models: r.models ?? [],
    premium_models: r.premium_models ?? [],
    agents: asAgents(r.agents),
    mandates: r.mandates ?? [],
  }));
}

/** The runs of one automation, newest first (max 500). */
export async function fetchAutomationRuns(
  kind: AutomationKind,
  automationId: string,
  days: number = AUTOMATION_COST_WINDOW_DAYS,
): Promise<AutomationRunCost[]> {
  const { data, error } = await schedulerDb(supabase).rpc("automation_cost_runs", {
    p_automation_kind: kind,
    p_automation_id: automationId,
    p_days: days,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    run_id: r.run_id,
    run_at: r.run_at,
    status: r.status,
    cost: num(r.cost),
    turns: num(r.turns),
    max_loop: num(r.max_loop),
    models: r.models ?? [],
    agent_ids: r.agent_ids ?? [],
    mandates: r.mandates ?? [],
    conversation_id: r.conversation_id,
    workflow_run_id: r.workflow_run_id,
  }));
}

// ── Red flags (the owner's spend rules, 2026-10-08) ─────────────────────────

/** Thresholds from common-docs/policies/ai-model-and-spend-rules.md. */
export const SPEND_FLAG_LIMITS = {
  runCostUsd: 1,
  avgTurns: 5,
  maxTurns: 20,
} as const;

export type AutomationFlagId =
  | "automated_spend"
  | "premium_model"
  | "avg_run_over_limit"
  | "run_over_limit"
  | "avg_turns_over_limit"
  | "max_turns_over_limit"
  | "runs_as_person"
  | "admin_account";

export interface AutomationFlag {
  id: AutomationFlagId;
  label: string;
  detail: string;
  severity: "critical" | "warning";
}

/**
 * A system job (a platform scheduled task) belongs to the system organization.
 * Anything else running it — a person's account or a person's organization —
 * puts system spend on a person (Arman, 2026-10-08).
 */
export function isSystemJob(row: AutomationCostRow): boolean {
  return row.automation_kind === "scheduled_task";
}

export function automationFlags(row: AutomationCostRow): AutomationFlag[] {
  const flags: AutomationFlag[] = [];
  const L = SPEND_FLAG_LIMITS;
  if (row.premium_models.length > 0) {
    flags.push({
      id: "premium_model",
      label: "Premium model",
      detail: `Uses ${row.premium_models.join(", ")}`,
      severity: "critical",
    });
  }
  if ((row.avg_run_cost ?? 0) > L.runCostUsd) {
    flags.push({
      id: "avg_run_over_limit",
      label: `Avg run > $${L.runCostUsd}`,
      detail: `Average run costs $${(row.avg_run_cost ?? 0).toFixed(2)}`,
      severity: "critical",
    });
  }
  if ((row.max_run_cost ?? 0) > L.runCostUsd) {
    flags.push({
      id: "run_over_limit",
      label: `A run > $${L.runCostUsd}`,
      detail: `Most expensive run cost $${(row.max_run_cost ?? 0).toFixed(2)}`,
      severity: "warning",
    });
  }
  if (row.avg_turns > L.avgTurns) {
    flags.push({
      id: "avg_turns_over_limit",
      label: `Avg turns > ${L.avgTurns}`,
      detail: `${row.avg_turns} model calls per run on average`,
      severity: "critical",
    });
  }
  if (row.max_turns > L.maxTurns) {
    flags.push({
      id: "max_turns_over_limit",
      label: `Max turns > ${L.maxTurns}`,
      detail: `One run made ${row.max_turns} model calls`,
      severity: "warning",
    });
  }
  // Every row here is automated, so any spend flag above makes it the worst case.
  if (flags.length > 0) {
    flags.unshift({
      id: "automated_spend",
      label: "Automated",
      detail: "Runs with nobody pressing a button — spend repeats every run",
      severity: "critical",
    });
  }
  if (isSystemJob(row) && !row.organization_is_system) {
    flags.push({
      id: "runs_as_person",
      label: "Runs as a person",
      detail: `System job runs as ${row.owner_email ?? "a person"} for ${row.organization_name ?? "a personal organization"}, not the system account`,
      severity: "critical",
    });
  } else if (!isSystemJob(row) && row.owner_is_platform_admin) {
    flags.push({
      id: "admin_account",
      label: "Admin account",
      detail: `Spend lands on platform admin ${row.owner_email ?? ""}, not the person or organization it serves`,
      severity: "warning",
    });
  }
  return flags;
}

/** Whether a model ran: spend with no recorded model is said out loud. */
export function automationAiState(
  row: AutomationCostRow,
): "ai" | "spend_unattributed" | "no_spend" | "no_runs" {
  if (row.runs === 0) return "no_runs";
  if (row.models.length > 0 || row.agents.length > 0 || row.mandates.length > 0) return "ai";
  if (row.cost > 0) return "spend_unattributed";
  return "no_spend";
}

// ── Doors (no dead ends) ────────────────────────────────────────────────────

export type AutomationSeat = "admin" | "org";

export const automationCostDetailHref = (kind: AutomationKind, id: string) =>
  `/administration/automation/scheduling/costs/${kind}/${id}`;

export function agentHref(agent: AutomationAgentRef, seat: AutomationSeat): string {
  return seat === "admin" && agent.agent_type === "builtin"
    ? `/administration/agents/system-agents/agents/${agent.id}/build`
    : `/agents/${agent.id}`;
}

export const mandateHref = (key: string) =>
  `/administration/intelligence/mandates/${encodeURIComponent(key)}`;

export function conversationHref(id: string, seat: AutomationSeat): string {
  return seat === "admin"
    ? `/administration/chat/cx-dashboard/conversations/${id}`
    : `/chat/${id}`;
}

export const workflowRunHref = (id: string) => `/workflows/runs/${id}`;
