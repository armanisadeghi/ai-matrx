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
 *   - run_approval_decide(p_id, decision…) — approve / approve_temporary (+ p_expires_at) / reject / reopen / details;
 *   - run_approval_reset(p_ids, p_note)    — restart the "since" stats from now (history kept);
 *   - run_approval_expiring(p_days)        — temporary approvals expiring soon (read-only);
 *   - run_approval_history(p_id)           — every event.
 * A TEMPORARY approval carries expires_at and reads as rejected from that moment (the gate checks it
 * live; run_approval_list records the flip as an `expired` history event when it next reads).
 * The server gate (aidream services/billing/run_approvals.py) holds the next non-interactive run of
 * a waiting or rejected subject once the platform knob billing.run_approval/enforced is on.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import { formatAdminUsd } from "@/components/cost/formatAdminCost";
import { currentSeesDollars } from "@/components/cost/costUnit";
import { knobNumber } from "@/lib/knobs/featureKnobs";
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

export type ApprovalStatus = "waiting" | "approved" | "temporary" | "rejected";
export type ApprovalSubjectKind = "agent" | "mandate" | AutomationKind;
export type ApprovalSeat = "admin" | "org";
export type ApprovalDecision = "approve" | "approve_temporary" | "reject" | "reopen" | "details";

export const SPEND_APPROVALS_ADMIN_PATH = "/administration/billing/approvals";
export const orgSpendApprovalsPath = (orgSlug: string) => `/organizations/${orgSlug}/admin/spend-approvals`;

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  waiting: "Waiting",
  approved: "Approved",
  temporary: "Temporary",
  rejected: "Rejected",
};

/** Whole days until a temporary approval's expiry (0 on its last day; negative once past). */
export function daysUntil(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((t - now) / 86_400_000) : null;
}

/** "Expires in 3 days" / "Expires today" / "Expired". */
export function expiryLabel(iso: string | null, now: number = Date.now()): string {
  const d = daysUntil(iso, now);
  if (d == null) return "";
  if (iso && Date.parse(iso) <= now) return "Expired";
  if (d === 0) return "Expires today";
  return `Expires in ${d} ${d === 1 ? "day" : "days"}`;
}

export const SUBJECT_KIND_LABEL: Record<ApprovalSubjectKind, string> = {
  agent: "Agent",
  mandate: "Mandate",
  scheduled_task: "Scheduled task",
  scheduled_agent: "Scheduled agent",
  recurring_mandate: "Recurring mandate",
  workflow_trigger: "Workflow trigger",
};

/**
 * Who started a subject's AGENT-DRIVEN runs (billing.run_approval_drivers, classified by the one
 * database rule platform.run_driver — Arman 2026-10-08). People's own chats are never counted here.
 */
export type RunDriver = "scheduled" | "workflow" | "sub_agent" | "api_mcp" | "test_account" | "system";
export const RUN_DRIVER_LABEL: Record<RunDriver, string> = {
  scheduled: "Scheduled",
  workflow: "Workflow",
  sub_agent: "Sub-agent",
  api_mcp: "API-MCP",
  test_account: "Test account",
  system: "System",
};
export const RUN_DRIVERS = Object.keys(RUN_DRIVER_LABEL) as RunDriver[];
/** "Test account 834 · Sub-agent 42" — largest first; "—" when no agent-driven run in 30 days. */
export function startedByLabel(by: Record<RunDriver, number>): string {
  const parts = RUN_DRIVERS.filter((d) => by[d] > 0)
    .sort((a, b) => by[b] - by[a])
    .map((d) => `${RUN_DRIVER_LABEL[d]} ${by[d]}`);
  return parts.length ? parts.join(" · ") : "—";
}

export interface SpendApprovalRow {
  id: string;
  /** Agent-driven runs of the last 30 days (never a person's own chat) and their cost. */
  automated_runs_30d: number;
  automated_cost_30d: number;
  /** automated_cost_30d / automated_runs_30d; null with no automated run. */
  automated_cost_per_run: number | null;
  started_by: Record<RunDriver, number>;
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
  /** Null after a reset until the subject has run again (nothing to estimate from yet). */
  est_monthly_cost: number | null;
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
  /** A temporary approval's expiry. */
  expires_at: string | null;
  /** Tracking reset: "since" stats count from since_at = max(first run, reset). */
  reset_at: string | null;
  reset_by_email: string | null;
  reset_note: string | null;
  since_at: string | null;
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
  /** From run_approval_list (same permission check as the decide RPC); false when unknown. */
  can_decide: boolean;
  avg_cost_since: number | null;
  est_monthly_cost: number | null;
  subject_name: string | null;
  expires_at: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const asStatus = (v: string): ApprovalStatus => (v === "approved" || v === "rejected" || v === "temporary" ? v : "waiting");
const asKind = (v: string): ApprovalSubjectKind => (v in SUBJECT_KIND_LABEL ? (v as ApprovalSubjectKind) : "agent");

export async function fetchSpendApprovals(orgId: string | null): Promise<SpendApprovalRow[]> {
  const [{ data, error }, { data: drivers, error: driversError }] = await Promise.all([
    supabase.schema("billing").rpc("run_approval_list", { p_org_id: orgId ?? undefined }),
    supabase.schema("billing").rpc("run_approval_drivers", { p_org_id: orgId ?? undefined }),
  ]);
  if (error) throw pgErrorToError(error);
  if (driversError) throw pgErrorToError(driversError);
  const byId = new Map((drivers ?? []).map((d) => [d.id, d]));
  return (data ?? []).map((r) => {
    const d = byId.get(r.id);
    const autoRuns = num(d?.automated_runs_30d);
    const autoCost = num(d?.automated_cost_30d);
    return {
    id: r.id,
    automated_runs_30d: autoRuns,
    automated_cost_30d: autoCost,
    automated_cost_per_run: autoRuns > 0 ? autoCost / autoRuns : null,
    started_by: Object.fromEntries(RUN_DRIVERS.map((k) => [k, num(d?.[k])])) as Record<RunDriver, number>,
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
    est_monthly_cost: numOrNull(r.est_monthly_cost),
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
    expires_at: r.expires_at,
    reset_at: r.reset_at,
    reset_by_email: r.reset_by_email,
    reset_note: r.reset_note,
    since_at: r.since_at,
    };
  });
}

export async function decideSpendApproval(
  id: string,
  decision: ApprovalDecision,
  fields: { note?: string; expectedResult?: string; expectedRunsPerMonth?: number | null; expiresAt?: string | null } = {},
): Promise<void> {
  const { error } = await supabase.schema("billing").rpc("run_approval_decide", {
    p_id: id,
    p_decision: decision,
    p_note: fields.note || undefined,
    p_expected_result: fields.expectedResult || undefined,
    p_expected_runs_per_month: fields.expectedRunsPerMonth ?? undefined,
    p_expires_at: fields.expiresAt ?? undefined,
  });
  if (error) throw pgErrorToError(error);
  invalidateApprovalStatus();
}

/** Restart the "since" stats of these approvals from now. History is kept (a `reset` event each). */
export async function resetSpendApprovalTracking(ids: string[], note?: string): Promise<number> {
  const { data, error } = await supabase.schema("billing").rpc("run_approval_reset", {
    p_ids: ids,
    p_note: note || undefined,
  });
  if (error) throw pgErrorToError(error);
  invalidateApprovalStatus();
  return num(data);
}

export interface ExpiringApproval {
  id: string;
  subject_kind: string;
  subject_name: string | null;
  subject_id: string;
  expires_at: string;
  days_left: number;
  expired: boolean;
}

/** Temporary approvals expiring within `days` (expired-not-yet-recorded included). */
export async function fetchExpiringApprovals(days = 7): Promise<ExpiringApproval[]> {
  const { data, error } = await supabase.schema("billing").rpc("run_approval_expiring", { p_days: days });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    subject_kind: r.subject_kind,
    subject_name: r.subject_name,
    subject_id: r.subject_id,
    expires_at: r.expires_at,
    days_left: num(r.days_left),
    expired: r.expired === true,
  }));
}

// ── Board colours: opinions, so knobs (platform.feature_knob billing.run_approval/*) ──

export interface ApprovalColorKnobs {
  avgRedUsd: number;
  avgAmberUsd: number;
  monthlyRedUsd: number;
  monthlyAmberUsd: number;
  expiryWarnDays: number;
  temporaryDefaultDays: number;
}

const APPROVAL_KNOB_FEATURE = "billing.run_approval";

export function useApprovalColorKnobs(): ApprovalColorKnobs | null {
  const [k, setK] = useState<ApprovalColorKnobs | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      knobNumber(APPROVAL_KNOB_FEATURE, "color_avg_red_usd"),
      knobNumber(APPROVAL_KNOB_FEATURE, "color_avg_amber_usd"),
      knobNumber(APPROVAL_KNOB_FEATURE, "color_monthly_red_usd"),
      knobNumber(APPROVAL_KNOB_FEATURE, "color_monthly_amber_usd"),
      knobNumber(APPROVAL_KNOB_FEATURE, "expiry_warn_days"),
      knobNumber(APPROVAL_KNOB_FEATURE, "temporary_default_days"),
    ])
      .then(([avgRedUsd, avgAmberUsd, monthlyRedUsd, monthlyAmberUsd, expiryWarnDays, temporaryDefaultDays]) => {
        if (live) setK({ avgRedUsd, avgAmberUsd, monthlyRedUsd, monthlyAmberUsd, expiryWarnDays, temporaryDefaultDays });
      })
      .catch((e: unknown) => {
        // A missing knob is loud, never a silent constant (lib/knobs/featureKnobs.ts contract).
        console.error("[spend-approvals] colour knobs unavailable", e);
      });
    return () => {
      live = false;
    };
  }, []);
  return k;
}

/** The tone a dollar figure earns against a red / amber pair; null = plain. */
export function costTone(value: number | null | undefined, red: number, amber: number): "danger" | "warning" | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= red) return "danger";
  if (value >= amber) return "warning";
  return null;
}

/** The tone an expiry earns: past or within the warning window = danger / warning. */
export function expiryTone(iso: string | null, warnDays: number, now: number = Date.now()): "danger" | "warning" | null {
  const d = daysUntil(iso, now);
  if (d == null) return null;
  if (iso && Date.parse(iso) <= now) return "danger";
  if (d <= warnDays) return "warning";
  return null;
}

export interface BatchDecisionResult {
  ok: string[];
  failed: { id: string; message: string }[];
}

/** One run_approval_decide per row (each permission-checked server-side); never throws for a row. */
export async function decideSpendApprovalsBatch(ids: string[], decision: ApprovalDecision): Promise<BatchDecisionResult> {
  const settled = await Promise.allSettled(ids.map((id) => decideSpendApproval(id, decision, { note: "Batch decision" })));
  const out: BatchDecisionResult = { ok: [], failed: [] };
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") out.ok.push(ids[i]);
    else out.failed.push({ id: ids[i], message: s.reason instanceof Error ? s.reason.message : String(s.reason) });
  });
  return out;
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

// ── Effective threshold per organization (the knob an org may lower) ─────────

const DEFAULT_THRESHOLD_USD = 1;
const thresholdCache = new Map<string, Promise<number>>();

export function fetchApprovalThreshold(orgId: string | null): Promise<number> {
  const k = orgId ?? "*";
  let p = thresholdCache.get(k);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase
        .schema("billing")
        .rpc("_run_approval_threshold", { p_org: (orgId ?? null) as string });
      if (error) throw pgErrorToError(error);
      const n = num(data);
      return n > 0 ? n : DEFAULT_THRESHOLD_USD;
    })();
    p.catch(() => thresholdCache.delete(k));
    thresholdCache.set(k, p);
  }
  return p;
}

/** The threshold that applies to a subject's organization; null until it resolves. */
export function useApprovalThreshold(orgId: string | null): number | null {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchApprovalThreshold(orgId)
      .then((v) => live && setT(v))
      .catch(() => live && setT(DEFAULT_THRESHOLD_USD));
    return () => {
      live = false;
    };
  }, [orgId]);
  return t;
}

/** "Under $1" / "Under $0.50" for the threshold in force. */
export function underThresholdLabel(thresholdUsd: number, seesDollars: boolean = currentSeesDollars()): string {
  return seesDollars ? `Under ${formatAdminUsd(thresholdUsd, { digits: "whole" })}` : "Under the approval limit";
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
      const [{ data, error }, listed] = await Promise.all([
        supabase.schema("billing").rpc("run_approval_status", { p_org_id: orgId ?? undefined }),
        // The list carries can_decide + cost figures for the inline dropdown; a failure only makes cells read-only.
        fetchSpendApprovals(orgId).catch(() => [] as SpendApprovalRow[]),
      ]);
      if (error) throw pgErrorToError(error);
      const detail = new Map(listed.map((l) => [l.id, l]));
      const idx: StatusIndex = new Map();
      for (const r of data ?? []) {
        const d = detail.get(r.id);
        idx.set(statusKey(r.subject_kind, r.subject_id), {
          id: r.id,
          subject_kind: asKind(r.subject_kind),
          subject_id: r.subject_id,
          status: asStatus(r.status),
          first_run_cost: num(r.first_run_cost),
          can_decide: d?.can_decide === true,
          avg_cost_since: d?.avg_cost_since ?? null,
          est_monthly_cost: d ? d.est_monthly_cost : null,
          expires_at: d?.expires_at ?? null,
          subject_name: d?.subject_name ?? null,
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

/** Drop the cache and re-prime this seat so filters/sorts keep reading a real index. */
export async function refreshApprovalStatus(orgId: string | null): Promise<StatusIndex> {
  invalidateApprovalStatus();
  return loadStatus(orgId);
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
