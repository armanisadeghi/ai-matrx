// features/scheduling/service/pythonClient.ts
//
// Auth'd fetch wrapper for the aidream Python /scheduling/* endpoints.
// Forwards the user's Supabase JWT so aidream's AuthMiddleware can resolve
// auth.uid() server-side.

import { supabase } from "@/utils/supabase/client";
import type { TriggerType } from "../types";

function baseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL_PROD ||
    "";
  return base.replace(/\/$/, "");
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error(
      "Not authenticated — cannot reach aidream /scheduling endpoints",
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ── Cron validate ──────────────────────────────────────────────────────────

export interface ValidateCronResponse {
  valid: boolean;
  error?: string | null;
  next_fires_utc: string[];
}

export async function validateCronServer(
  expression: string,
  tz: string,
  nextN = 5,
): Promise<ValidateCronResponse> {
  const res = await fetch(`${baseUrl()}/scheduling/validate-cron`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ expression, tz, next_n: nextN }),
  });
  if (!res.ok) throw new Error(`validate-cron ${res.status}`);
  return (await res.json()) as ValidateCronResponse;
}

// ── Compute next_due_at ────────────────────────────────────────────────────

export interface ComputeNextDueResponse {
  next_due_at: string | null;
  event_driven: boolean;
}

export async function computeNextDueAtServer(
  triggerType: TriggerType,
  config: Record<string, unknown>,
): Promise<ComputeNextDueResponse> {
  const res = await fetch(`${baseUrl()}/scheduling/compute-next-due-at`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ trigger_type: triggerType, config }),
  });
  if (!res.ok) throw new Error(`compute-next-due-at ${res.status}`);
  return (await res.json()) as ComputeNextDueResponse;
}

// ── Run now (streaming) ────────────────────────────────────────────────────

export async function runNowServer(taskId: string): Promise<{ run_id: string }> {
  const res = await fetch(
    `${baseUrl()}/scheduling/run-now/${encodeURIComponent(taskId)}`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );
  if (!res.ok) throw new Error(`run-now ${res.status}`);
  return (await res.json()) as { run_id: string };
}

// ── Scanner status (admin) ─────────────────────────────────────────────────

export interface ScannerStatusResponse {
  running: boolean;
  started_at: string | null;
  last_tick_at: string | null;
  last_tick_duration_ms: number | null;
  last_tick_claimed: number;
  last_tick_expired_sweeps: number;
  total_runs_dispatched: number;
  consecutive_errors: number;
  error_message: string | null;
}

export async function fetchScannerStatus(): Promise<ScannerStatusResponse> {
  const res = await fetch(`${baseUrl()}/scheduling/scanner-status`, {
    method: "GET",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`scanner-status ${res.status}`);
  return (await res.json()) as ScannerStatusResponse;
}
