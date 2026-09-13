import type { DesktopPresence } from "@/features/agents/redux/execution-system/client-capabilities/desktop-presence";

export interface CodexUsageMetrics {
  input_tokens?: number;
  cached_input_tokens?: number;
  uncached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
  response_count?: number;
  estimated_standard_credits?: number;
  peer_messages?: number;
  task_wakes?: number;
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
  activity: CodexUsageRow[] | null;
  cells: CodexUsageRow[];
  tasks: CodexUsageRow[];
  bins: CodexUsageRow[];
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
  return Array.isArray(value) && value.every(isRecord);
}

function isSnapshot(value: unknown): value is CodexUsageSnapshot {
  if (!isRecord(value) || !isRecord(value.range) || !isRecord(value.credits))
    return false;
  return (
    typeof value.collected_at === "string" &&
    typeof value.range.start === "string" &&
    typeof value.range.end === "string" &&
    isRecord(value.coverage) &&
    (typeof value.credits.estimated_standard === "number" ||
      value.credits.estimated_standard === null) &&
    (typeof value.credits.measured_allowance === "number" ||
      value.credits.measured_allowance === null) &&
    isRecord(value.totals) &&
    isRows(value.models) &&
    isRows(value.model_effort) &&
    isRows(value.projects) &&
    isRows(value.conversations) &&
    isRows(value.workers) &&
    (value.activity === null || isRows(value.activity)) &&
    isRows(value.cells) &&
    isRows(value.tasks) &&
    isRows(value.bins)
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
    headers: { Authorization: `Bearer ${target.access_token}` },
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
