import type { DesktopPresence } from "@/features/agents/redux/execution-system/client-capabilities/desktop-presence";

export interface CodexUsageMetrics {
  input_tokens?: number;
  cached_input_tokens?: number;
  uncached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
  response_count?: number;
  estimated_standard_credits?: number | null;
  peer_message_call_ids?: number;
  peer_message_invocations?: number;
  child_call_ids?: number;
  child_invocations?: number;
  collaboration_message_calls?: number;
}

export interface CodexUsageRow extends CodexUsageMetrics {
  label?: string;
  model?: string | null;
  effort?: string | null;
  project?: string | null;
  title?: string | null;
  conversation_title?: string | null;
  conversation_id?: string | null;
  task_id?: string | null;
  id?: string | null;
  root_id?: string | null;
  worker?: string | null;
  start?: string | null;
  /** Local supplies this only when a verified in-app route exists. */
  href?: string | null;
}

export interface CodexUsageSnapshot {
  collected_at: string;
  indexed_at?: string;
  range: { start: string; end: string };
  coverage: Record<string, unknown>;
  credits: {
    estimated_standard: number | null;
    measured_allowance: number | null;
  };
  totals: CodexUsageMetrics;
  models: CodexUsageRow[];
  model_effort: CodexUsageRow[];
  projects: CodexUsageRow[];
  conversations: CodexUsageRow[];
  workers: CodexUsageRow[];
  activity: {
    classification: string;
    outbound_peer_calls: number;
    child_calls: number;
    inbound_peer_wakes: number | "unknown";
    causal_cost: number | "unknown";
  } | null;
  cells: CodexUsageRow[];
  tasks: CodexUsageRow[];
  bins: CodexUsageRow[];
}

export interface CodexAllowanceLimit {
  bucket: string;
  used_percent: number | null;
  remaining_percent: number | null;
  window_minutes: number | null;
  resets_at: number | null;
}

export interface CodexUsageAllowance {
  status: "available" | "unavailable";
  observed_at: string;
  reason?: string;
  limits: CodexAllowanceLimit[];
}

export type CodexUsageGrouping = "model" | "model_effort";

export interface CodexUsageReadInput {
  start: string;
  end: string;
  grouping: CodexUsageGrouping;
  refresh?: boolean;
}

interface LocalProxyBinding {
  base_url: string;
  access_token: string;
  target_kind: "local_machine";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRows(value: unknown): value is CodexUsageRow[] {
  return Array.isArray(value) && value.every(isUsageRow);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalMetric(value: unknown): boolean {
  return value === undefined || isNonNegativeFinite(value);
}

function isNullableNonNegative(value: unknown): boolean {
  return value === null || isNonNegativeFinite(value);
}

function isUsageRow(value: unknown): value is CodexUsageRow {
  if (!isRecord(value)) return false;
  const metrics = [
    "input_tokens",
    "cached_input_tokens",
    "uncached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
    "response_count",
    "peer_message_call_ids",
    "peer_message_invocations",
    "child_call_ids",
    "child_invocations",
    "collaboration_message_calls",
  ];
  return (
    metrics.every((metric) => isOptionalMetric(value[metric])) &&
    (value.estimated_standard_credits === undefined ||
      value.estimated_standard_credits === null ||
      isNonNegativeFinite(value.estimated_standard_credits))
  );
}

function isActivity(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.classification === "string" &&
    isNonNegativeFinite(value.outbound_peer_calls) &&
    isNonNegativeFinite(value.child_calls) &&
    (isNonNegativeFinite(value.inbound_peer_wakes) ||
      value.inbound_peer_wakes === "unknown") &&
    (isNonNegativeFinite(value.causal_cost) || value.causal_cost === "unknown")
  );
}

function isSnapshot(value: unknown): value is CodexUsageSnapshot {
  if (!isRecord(value) || !isRecord(value.range) || !isRecord(value.credits))
    return false;
  return (
    typeof value.collected_at === "string" &&
    (typeof value.indexed_at === "string" || value.indexed_at === undefined) &&
    typeof value.range.start === "string" &&
    typeof value.range.end === "string" &&
    isRecord(value.coverage) &&
    Object.values(value.coverage).every(
      (coverage) =>
        typeof coverage !== "number" || isNonNegativeFinite(coverage),
    ) &&
    isNullableNonNegative(value.credits.estimated_standard) &&
    isNullableNonNegative(value.credits.measured_allowance) &&
    isUsageRow(value.totals) &&
    isRows(value.models) &&
    isRows(value.model_effort) &&
    isRows(value.projects) &&
    isRows(value.conversations) &&
    isRows(value.workers) &&
    (value.activity === null || isActivity(value.activity)) &&
    isRows(value.cells) &&
    isRows(value.tasks) &&
    isRows(value.bins)
  );
}

function isAllowance(value: unknown): value is CodexUsageAllowance {
  return (
    isRecord(value) &&
    (value.status === "available" || value.status === "unavailable") &&
    typeof value.observed_at === "string" &&
    Array.isArray(value.limits) &&
    value.limits.every(
      (limit) =>
        isRecord(limit) &&
        typeof limit.bucket === "string" &&
        isNullableNonNegative(limit.used_percent) &&
        isNullableNonNegative(limit.remaining_percent) &&
        isNullableNonNegative(limit.window_minutes) &&
        isNullableNonNegative(limit.resets_at),
    )
  );
}

async function resolveLocalProxy(recordId: string): Promise<LocalProxyBinding> {
  const response = await fetch("/api/compute-targets/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "local-pc", id: recordId }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason =
      isRecord(body) && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new Error(`Matrx Local is unavailable (${reason}).`);
  }
  if (
    !isRecord(body) ||
    body.target_kind !== "local_machine" ||
    typeof body.base_url !== "string" ||
    typeof body.access_token !== "string"
  ) {
    throw new Error(
      "The authenticated Matrx Local connection returned an invalid target.",
    );
  }
  return {
    base_url: body.base_url,
    access_token: body.access_token,
    target_kind: "local_machine",
  };
}

/** Reads through the existing owner-checked AIDream local proxy, never public Broadcast or loopback. */
export async function readCodexUsage(
  presence: DesktopPresence | null,
  input: CodexUsageReadInput,
): Promise<CodexUsageSnapshot> {
  if (!presence || !presence.recordId)
    throw new Error(
      "Matrx Local is disconnected. Open and connect Matrx Local, then refresh.",
    );
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  ) {
    throw new Error("Choose a valid time range with an end after its start.");
  }
  const target = await resolveLocalProxy(presence.recordId);
  const url = new URL(`${target.base_url.replace(/\/$/, "")}/codex-usage`);
  url.searchParams.set("start", input.start);
  url.searchParams.set("end", input.end);
  url.searchParams.set("grouping", input.grouping);
  if (input.refresh) url.searchParams.set("refresh", "true");
  const response = await fetch(url, {
    headers: { "X-Sandbox-Access-Token": target.access_token },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason =
      isRecord(body) && typeof body.detail === "string"
        ? body.detail
        : `HTTP ${response.status}`;
    throw new Error(`Matrx Local usage read failed (${reason}).`);
  }
  if (!isSnapshot(body))
    throw new Error(
      "Matrx Local returned usage data outside the agreed sanitized contract.",
    );
  return body;
}

/** Reads the account-level allowance through the same owner-checked proxy. */
export async function readCodexUsageAllowance(
  presence: DesktopPresence | null,
): Promise<CodexUsageAllowance> {
  if (!presence || !presence.recordId)
    throw new Error(
      "Matrx Local is disconnected. Open and connect Matrx Local, then refresh.",
    );
  const target = await resolveLocalProxy(presence.recordId);
  const url = `${target.base_url.replace(/\/$/, "")}/codex-usage/allowance`;
  const response = await fetch(url, {
    headers: { "X-Sandbox-Access-Token": target.access_token },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `Matrx Local allowance read failed (HTTP ${response.status}).`,
    );
  if (!isAllowance(body))
    throw new Error(
      "Matrx Local returned allowance data outside the agreed sanitized contract.",
    );
  return body;
}
