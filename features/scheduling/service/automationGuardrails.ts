/**
 * features/scheduling/service/automationGuardrails.ts
 *
 * THE read/write path for automation limits (aidream bc4ed31283). Every
 * automation carries a `guardrails` jsonb on its subject row (scheduler.sch_task,
 * workflow.trigger, scheduler.agent_schedule). The database fills defaults from
 * the knobs `automation.guardrails/*`, refuses enabling an AI automation without
 * max_turns and max_cost_usd_per_run, and pauses an automation that hits a limit.
 *
 * Reads: scheduler.automation_guardrail_status(kind, id). Writes: the jsonb
 * column directly. Resume: scheduler.automation_guardrail_resume(kind, id).
 */
import { supabase } from "@/utils/supabase/client";
import { schedulerDb } from "@/utils/supabase/schedulerDb";
import { pgErrorToError } from "@ai-matrx/data";
import type { Json } from "@/types/database.types";
import type { AutomationKind } from "@/features/scheduling/service/automationCosts";

export type GuardrailKind = "sch_task" | "workflow_trigger" | "agent_schedule";

export const LIMIT_KEYS = [
  "max_turns",
  "max_cost_usd_per_run",
  "max_runtime_seconds",
  "max_cost_usd_daily",
  "max_cost_usd_weekly",
  "max_cost_usd_monthly",
  "max_failure_pct",
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** The two limits an automatic AI task cannot run without. */
export const REQUIRED_LIMIT_KEYS: readonly LimitKey[] = ["max_turns", "max_cost_usd_per_run"];

export const COST_LIMIT_KEYS: readonly LimitKey[] = [
  "max_cost_usd_per_run",
  "max_cost_usd_daily",
  "max_cost_usd_weekly",
  "max_cost_usd_monthly",
];

export type Guardrails = Partial<Record<LimitKey, number | null>> & {
  uses_ai?: boolean;
  basis?: Record<string, string>;
};

export interface GuardrailPause {
  reason?: string;
  breach?: string;
  at?: string;
  source?: string;
}

export interface GuardrailStatus {
  kind: string;
  id: string;
  enabled: boolean;
  guardrails: Guardrails;
  defaults: Guardrails;
  missing: LimitKey[];
  spend: { day: number; week: number; month: number };
  failures: { window_runs: number; min_runs: number; finished: number; failed: number; pct: number | null };
  paused: GuardrailPause | null;
}

/** The guardrail kind a rollup row's automation kind maps to. */
export function guardrailKindOf(kind: AutomationKind): GuardrailKind {
  return kind === "workflow_trigger" ? "workflow_trigger" : "sch_task";
}

function num(v: unknown): number | null {
  if (typeof v === "boolean" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise a raw jsonb value into numbers (a non-number limit is "not set"). */
export function parseGuardrails(raw: unknown): Guardrails {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Guardrails = {};
  for (const k of LIMIT_KEYS) out[k] = num(o[k]);
  out.uses_ai = o.uses_ai === true;
  const basis = o.basis;
  if (basis && typeof basis === "object" && !Array.isArray(basis)) {
    out.basis = Object.fromEntries(
      Object.entries(basis as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][],
    );
  }
  return out;
}

export function parsePause(meta: unknown): GuardrailPause | null {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  const s = m?.auto_suspended;
  if (!s || typeof s !== "object") return null;
  const r = s as Record<string, unknown>;
  if (r.source !== "automation_guardrails") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return { reason: str(r.reason), breach: str(r.breach), at: str(r.at), source: str(r.source) };
}

/** Required limits that are not set (a missing one blocks enabling AI). */
export function missingRequired(g: Guardrails | null | undefined): LimitKey[] {
  return REQUIRED_LIMIT_KEYS.filter((k) => !((g?.[k] ?? 0) > 0));
}

export async function fetchGuardrailStatus(kind: GuardrailKind, id: string): Promise<GuardrailStatus | null> {
  const { data, error } = await schedulerDb(supabase).rpc("automation_guardrail_status", { p_kind: kind, p_id: id });
  // The status function also sums spend from tables a signed-in person cannot read (42501); the
  // limits themselves are readable, so read those directly and leave spend/failures empty.
  if (error?.code === "42501") return fetchLimitsOnly(kind, id);
  if (error) throw pgErrorToError(error);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const sp = (d.spend ?? {}) as Record<string, unknown>;
  const f = (d.failures ?? {}) as Record<string, unknown>;
  return {
    kind: String(d.kind ?? kind),
    id: String(d.id ?? id),
    enabled: d.enabled === true,
    guardrails: parseGuardrails(d.guardrails),
    defaults: parseGuardrails(d.defaults),
    missing: Array.isArray(d.missing) ? (d.missing.filter((k) => typeof k === "string") as LimitKey[]) : [],
    spend: { day: num(sp.day) ?? 0, week: num(sp.week) ?? 0, month: num(sp.month) ?? 0 },
    failures: {
      window_runs: num(f.window_runs) ?? 0,
      min_runs: num(f.min_runs) ?? 0,
      finished: num(f.finished) ?? 0,
      failed: num(f.failed) ?? 0,
      pct: num(f.pct),
    },
    paused: parsePause({ auto_suspended: d.paused }) ?? (d.paused && typeof d.paused === "object" ? { ...(d.paused as GuardrailPause), source: "automation_guardrails" } : null),
  };
}

async function fetchLimitsOnly(kind: GuardrailKind, id: string): Promise<GuardrailStatus | null> {
  let enabled = false;
  let raw: unknown = null;
  let meta: unknown = null;
  let orgId: string | null = null;
  let userId: string | null = null;
  if (kind === "workflow_trigger") {
    const { data, error } = await supabase
      .schema("workflow")
      .from("trigger")
      .select("is_active, guardrails, metadata, organization_id, created_by")
      .eq("id", id)
      .maybeSingle();
    if (error) throw pgErrorToError(error);
    if (!data) return null;
    enabled = data.is_active;
    raw = data.guardrails;
    meta = data.metadata;
    orgId = data.organization_id;
    userId = data.created_by;
  } else if (kind === "agent_schedule") {
    const { data, error } = await schedulerDb(supabase).from("agent_schedule").select("enabled, guardrails").eq("id", id).maybeSingle();
    if (error) throw pgErrorToError(error);
    if (!data) return null;
    enabled = data.enabled;
    raw = data.guardrails;
  } else {
    const { data, error } = await schedulerDb(supabase)
      .from("sch_task")
      .select("enabled, guardrails, metadata, organization_id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw pgErrorToError(error);
    if (!data) return null;
    enabled = data.enabled;
    raw = data.guardrails;
    meta = data.metadata;
    orgId = data.organization_id;
    userId = data.user_id;
  }
  const d = await schedulerDb(supabase).rpc("automation_guardrail_defaults", {
    p_organization_id: orgId ?? undefined,
    p_user_id: userId ?? undefined,
  });
  if (d.error) throw pgErrorToError(d.error);
  const guardrails = parseGuardrails(raw);
  return {
    kind,
    id,
    enabled,
    guardrails,
    defaults: parseGuardrails(d.data),
    missing: REQUIRED_LIMIT_KEYS.filter((k) => !((guardrails[k] ?? 0) > 0)),
    spend: { day: 0, week: 0, month: 0 },
    failures: { window_runs: 0, min_runs: 0, finished: 0, failed: 0, pct: null },
    paused: parsePause(meta),
  };
}

/** Bulk read of limits + pause state for table rows (one query per table, RLS-scoped). */
export async function fetchGuardrailsFor(
  kind: GuardrailKind,
  ids: readonly string[],
): Promise<Map<string, { guardrails: Guardrails; paused: GuardrailPause | null }>> {
  const out = new Map<string, { guardrails: Guardrails; paused: GuardrailPause | null }>();
  if (ids.length === 0) return out;
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    if (kind === "workflow_trigger") {
      const { data, error } = await supabase.schema("workflow").from("trigger").select("id, guardrails, metadata").in("id", part);
      if (error) throw pgErrorToError(error);
      for (const r of data ?? []) out.set(r.id, { guardrails: parseGuardrails(r.guardrails), paused: parsePause(r.metadata) });
    } else {
      const { data, error } = await schedulerDb(supabase).from("sch_task").select("id, guardrails, metadata").in("id", part);
      if (error) throw pgErrorToError(error);
      for (const r of data ?? []) out.set(r.id, { guardrails: parseGuardrails(r.guardrails), paused: parsePause(r.metadata) });
    }
  }
  return out;
}

/**
 * Save the limits. The database validates; a refusal (enabling AI without max turns
 * and max cost per run) comes back as an Error carrying the database's own sentence.
 */
export async function saveGuardrails(kind: GuardrailKind, id: string, g: Guardrails): Promise<void> {
  const body: Record<string, Json> = {};
  for (const k of LIMIT_KEYS) body[k] = g[k] ?? null;
  if (g.uses_ai !== undefined) body.uses_ai = g.uses_ai;
  if (g.basis) body.basis = g.basis;
  const payload = body as Json;
  const res =
    kind === "workflow_trigger"
      ? await supabase.schema("workflow").from("trigger").update({ guardrails: payload }).eq("id", id)
      : kind === "agent_schedule"
        ? await schedulerDb(supabase).from("agent_schedule").update({ guardrails: payload }).eq("id", id)
        : await schedulerDb(supabase).from("sch_task").update({ guardrails: payload }).eq("id", id);
  if (res.error) throw pgErrorToError(res.error);
}

export async function resumeAutomation(kind: GuardrailKind, id: string): Promise<boolean> {
  const { data, error } = await schedulerDb(supabase).rpc("automation_guardrail_resume", { p_kind: kind, p_id: id });
  if (error) throw pgErrorToError(error);
  return data === true;
}

/** The sentence for the kind of limit that stopped a run (result_metadata.guardrail.kind). */
export function guardrailBreachLabel(kind: string | null | undefined): string {
  const k = (kind ?? "").replace(/^guardrail\./, "");
  switch (k) {
    case "max_turns": return "Max turns";
    case "max_cost_run": return "Max cost per run";
    case "max_runtime": return "Max time per run";
    case "cap_daily": return "Daily spend cap";
    case "cap_weekly": return "Weekly spend cap";
    case "cap_monthly": return "Monthly spend cap";
    case "failure_pct": return "Max failure rate";
    case "missing_limits": return "Missing limits";
    default: return k ? k.replace(/_/g, " ") : "A limit";
  }
}
