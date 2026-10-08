/**
 * features/admin/spend-approvals/spendApprovals.ts
 *
 * SPEND APPROVALS (Arman 2026-10-08; common-docs/policies/ai-model-and-spend-rules.md §3–4):
 * an agent, mandate or automation whose single run cost more than the threshold ($1, the knob
 * billing.run_approval/threshold_usd) waits for approval after that first run. A run = one
 * request (every execution sharing a request id); an automation's run = one scheduler / workflow run.
 *
 * Read + write path, all permission-checked RPCs in `billing`:
 *   - run_approval_list(p_org_id)          — the page rows (null = every org, super admin);
 *   - run_approval_status(p_org_id)        — status per subject, for the spend boards' column;
 *   - run_approval_waiting_count(p_org_id) — the nav badge;
 *   - run_approval_decide(p_id, decision…) — approve / reject / reopen / details;
 *   - run_approval_history(p_id)           — every event.
 * The server gate (aidream services/billing/run_approvals.py) holds the next non-interactive run of
 * a waiting or rejected subject once the platform knob billing.run_approval/enforced is on.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import {
  agentHref,
  automationCostDetailHref,
  conversationHref,
  mandateHref,
  orgAutomationCostDetailHref,
  orgMandateHref,
  workflowRunHref,
  type AutomationKind,
} from "@/features/scheduling/service/automationCosts";

export type ApprovalStatus = "waiting" | "approved" | "rejected";
export type ApprovalSubjectKind = "agent" | "mandate" | AutomationKind;
export type ApprovalSeat = "admin" | "org";
export type ApprovalDecision = "approve" | "reject" | "reopen" | "details";

export const SPEND_APPROVALS_ADMIN_PATH = "/administration/billing/approvals";
export const orgSpendApprovalsPath = (orgSlug: string) => `/organizations/${orgSlug}/admin/spend-approvals`;

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  waiting: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
};

export const SUBJECT_KIND_LABEL: Record<ApprovalSubjectKind, string> = {
  agent: "Agent",
  mandate: "Mandate",
  scheduled_task: "Scheduled task",
  scheduled_agent: "Scheduled agent",
  recurring_mandate: "Recurring mandate",
  workflow_trigger: "Workflow trigger",
};

export interface SpendApprovalRow {
  id: string;
  subject_kind: ApprovalSubjectKind;
  subject_id: string;
  subject_name: string | null;
  agent_id: string | null;
  agent_type: string | null;
  mandate_key: string | null;
  status: ApprovalStatus;
  threshold_usd: number;
  first_run_key: string | null;
  first_run_request_id: string | null;
  first_run_conversation_id: string | null;
  first_run_workflow_run_id: string | null;
  first_run_cost: number;
  first_run_at: string | null;
  first_run_turns: number;
  first_run_models: string[];
  first_run_person_id: string | null;
  first_run_person_email: string | null;
  runs_since: number;
  avg_cost_since: number | null;
  max_cost_since: number | null;
  runs_30d: number;
  est_monthly_cost: number;
  expected_result: string | null;
  expected_runs_per_month: number | null;
  blocked_runs: number;
  last_blocked_at: string | null;
  seeded: boolean;
  decided_by_email: string | null;
  decided_at: string | null;
  decision_note: string | null;
  organization_id: string;
  organization_name: string | null;
  organization_is_system: boolean;
  can_decide: boolean;
}

export interface SpendApprovalEvent {
  id: string;
  action: string;
  to_status: string | null;
  note: string | null;
  actor_email: string | null;
  data: unknown;
  created_at: string;
}

export interface ApprovalStatusRow {
  id: string;
  subject_kind: ApprovalSubjectKind;
  subject_id: string;
  status: ApprovalStatus;
  first_run_cost: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const asStatus = (v: string): ApprovalStatus => (v === "approved" || v === "rejected" ? v : "waiting");
const asKind = (v: string): ApprovalSubjectKind => (v in SUBJECT_KIND_LABEL ? (v as ApprovalSubjectKind) : "agent");

export async function fetchSpendApprovals(orgId: string | null): Promise<SpendApprovalRow[]> {
  const { data, error } = await supabase.schema("billing").rpc("run_approval_list", { p_org_id: orgId ?? undefined });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    subject_kind: asKind(r.subject_kind),
    subject_id: r.subject_id,
    subject_name: r.subject_name,
    agent_id: r.agent_id,
    agent_type: r.agent_type,
    mandate_key: r.mandate_key,
    status: asStatus(r.status),
    threshold_usd: num(r.threshold_usd),
    first_run_key: r.first_run_key,
    first_run_request_id: r.first_run_request_id,
    first_run_conversation_id: r.first_run_conversation_id,
    first_run_workflow_run_id: r.first_run_workflow_run_id,
    first_run_cost: num(r.first_run_cost),
    first_run_at: r.first_run_at,
    first_run_turns: num(r.first_run_turns),
    first_run_models: r.first_run_models ?? [],
    first_run_person_id: r.first_run_person_id,
    first_run_person_email: r.first_run_person_email,
    runs_since: num(r.runs_since),
    avg_cost_since: numOrNull(r.avg_cost_since),
    max_cost_since: numOrNull(r.max_cost_since),
    runs_30d: num(r.runs_30d),
    est_monthly_cost: num(r.est_monthly_cost),
    expected_result: r.expected_result,
    expected_runs_per_month: numOrNull(r.expected_runs_per_month),
    blocked_runs: num(r.blocked_runs),
    last_blocked_at: r.last_blocked_at,
    seeded: r.seeded === true,
    decided_by_email: r.decided_by_email,
    decided_at: r.decided_at,
    decision_note: r.decision_note,
    organization_id: r.organization_id,
    organization_name: r.organization_name,
    organization_is_system: r.organization_is_system === true,
    can_decide: r.can_decide === true,
  }));
}

export async function decideSpendApproval(
  id: string,
  decision: ApprovalDecision,
  fields: { note?: string; expectedResult?: string; expectedRunsPerMonth?: number | null } = {},
): Promise<void> {
  const { error } = await supabase.schema("billing").rpc("run_approval_decide", {
    p_id: id,
    p_decision: decision,
    p_note: fields.note || undefined,
    p_expected_result: fields.expectedResult || undefined,
    p_expected_runs_per_month: fields.expectedRunsPerMonth ?? undefined,
  });
  if (error) throw pgErrorToError(error);
  invalidateApprovalStatus();
}

export async function fetchSpendApprovalHistory(id: string): Promise<SpendApprovalEvent[]> {
  const { data, error } = await supabase.schema("billing").rpc("run_approval_history", { p_id: id });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((e) => ({
    id: e.id,
    action: e.action,
    to_status: e.to_status,
    note: e.note,
    actor_email: e.actor_email,
    data: e.data,
    created_at: e.created_at,
  }));
}

export async function fetchWaitingApprovalCount(orgId: string | null): Promise<number> {
  const { data, error } = await supabase.schema("billing").rpc("run_approval_waiting_count", { p_org_id: orgId ?? undefined });
  if (error) throw pgErrorToError(error);
  return num(data);
}

// ── Status per subject, shared by every spend board (one fetch per seat) ─────

type StatusIndex = Map<string, ApprovalStatusRow>;
const statusKey = (kind: string, id: string) => `${kind}:${id}`;
const statusCache = new Map<string, Promise<StatusIndex>>();
const statusResolved = new Map<string, StatusIndex>();

function loadStatus(orgId: string | null): Promise<StatusIndex> {
  const k = orgId ?? "*";
  let p = statusCache.get(k);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.schema("billing").rpc("run_approval_status", { p_org_id: orgId ?? undefined });
      if (error) throw pgErrorToError(error);
      const idx: StatusIndex = new Map();
      for (const r of data ?? []) {
        idx.set(statusKey(r.subject_kind, r.subject_id), {
          id: r.id,
          subject_kind: asKind(r.subject_kind),
          subject_id: r.subject_id,
          status: asStatus(r.status),
          first_run_cost: num(r.first_run_cost),
        });
      }
      statusResolved.set(k, idx);
      return idx;
    })();
    p.catch(() => statusCache.delete(k));
    statusCache.set(k, p);
  }
  return p;
}

export function invalidateApprovalStatus(): void {
  statusCache.clear();
  statusResolved.clear();
}

/** The approval rows for one seat (null = every organization), loaded once and shared. */
export function useApprovalStatusIndex(orgId: string | null): { index: StatusIndex | null; error: string | null } {
  const k = orgId ?? "*";
  const [index, setIndex] = useState<StatusIndex | null>(statusResolved.get(k) ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadStatus(orgId)
      .then((i) => live && setIndex(i))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [orgId]);
  return { index, error };
}

/** First approval among the subjects (most specific first). */
export function approvalFor(index: StatusIndex | null, subjects: [string, string | null | undefined][]): ApprovalStatusRow | null {
  if (!index) return null;
  for (const [kind, id] of subjects) {
    if (!id) continue;
    const hit = index.get(statusKey(kind, id));
    if (hit) return hit;
  }
  return null;
}

/** Sync read for table filter/sort accessors (empty until the shared fetch resolves). */
export function approvalStatusSync(orgId: string | null, subjects: [string, string | null | undefined][]): string {
  return approvalFor(statusResolved.get(orgId ?? "*") ?? null, subjects)?.status ?? "none";
}

// ── Doors ───────────────────────────────────────────────────────────────────

export function approvalHref(id: string, seat: ApprovalSeat, orgSlug?: string): string {
  const base = seat === "org" && orgSlug ? orgSpendApprovalsPath(orgSlug) : SPEND_APPROVALS_ADMIN_PATH;
  return `${base}?id=${encodeURIComponent(id)}`;
}

/** Where the subject itself lives, for this seat. */
export function subjectHref(row: SpendApprovalRow, seat: ApprovalSeat, orgSlug?: string): string | null {
  switch (row.subject_kind) {
    case "agent":
      return row.agent_id
        ? agentHref({ id: row.agent_id, name: row.subject_name ?? row.agent_id, agent_type: row.agent_type }, seat)
        : null;
    case "mandate":
      return seat === "org" && orgSlug ? orgMandateHref(orgSlug, row.subject_id) : mandateHref(row.subject_id);
    default:
      return seat === "org" && orgSlug
        ? orgAutomationCostDetailHref(orgSlug, row.subject_kind, row.subject_id)
        : automationCostDetailHref(row.subject_kind, row.subject_id);
  }
}

/** The real first run: its conversation, else its workflow run. */
export function firstRunHref(row: SpendApprovalRow, seat: ApprovalSeat): string | null {
  if (row.first_run_conversation_id) return conversationHref(row.first_run_conversation_id, seat);
  if (row.first_run_workflow_run_id) return workflowRunHref(row.first_run_workflow_run_id);
  return null;
}
