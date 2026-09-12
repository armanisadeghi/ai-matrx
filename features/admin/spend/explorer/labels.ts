// features/admin/spend/explorer/labels.ts
//
// Plain-English names for the ledger's dimensions, the wording for "this row
// has no value", and where each identity opens (no dead ends: every identity
// the explorer names must open somewhere real).
//
// Doc: features/admin/spend/FEATURE.md

import { SPEND_NONE_KEY, type SpendDimension, type SpendDimensionRow } from "../types";

export const DIMENSION_LABEL: Record<SpendDimension, string> = {
  organization: "Organization",
  user: "Person",
  agent: "Agent",
  app: "App",
  feature: "Feature",
  origin: "How it started",
  trigger: "Manual or automated",
  source: "Execution type",
  model: "Model",
  conversation: "Conversation",
  day: "Day",
};

/** One line under each table: what the dimension actually is. */
export const DIMENSION_HINT: Record<SpendDimension, string> = {
  organization: "The organization the execution ran under.",
  user: "The signed-in person the request belongs to. Shared logins (admin@admin.com) collapse everyone using them into one row.",
  agent: "The agent definition that ran. Mandates (server-side jobs) show as their agent.",
  app: "The client that sent the request: the web app, the Python server itself, workflow studio, the MCP agent service, the scheduler.",
  feature: "The surface or job inside the app: chat, masterwork, a mandate key, a workflow run.",
  origin: "The origin class on the request: human, api, child_agent, workflow, scheduled, system, client_auto.",
  trigger: "Manual = a human or an API caller asked for it. Automated = child agents, workflows, schedules and system jobs.",
  source: "What kind of execution the ledger row is: a conversation turn, an internal agent run, a scheduler poll…",
  model: "The model that billed the most of the request. A request that fell back across models is counted once, under the model that cost the most.",
  conversation: "The conversation the turn belongs to. Internal runs with no conversation are grouped under 'Not inside a conversation'.",
  day: "Local calendar day in the zone shown at the top of the page.",
};

/** What an empty value means, per dimension — never the bare word "Unattributed". */
export const NONE_LABEL: Record<SpendDimension, string> = {
  organization: "No organization on the row",
  user: "No person recorded",
  agent: "No agent recorded",
  app: "No app recorded",
  feature: "No feature recorded",
  origin: "No origin recorded",
  trigger: "Unknown",
  source: "No execution type",
  model: "Model not recorded (no API-call row)",
  conversation: "Not inside a conversation",
  day: "No day",
};

export function rowLabel(dim: SpendDimension, row: Pick<SpendDimensionRow, "key" | "label">): string {
  if (row.key === SPEND_NONE_KEY) return NONE_LABEL[dim];
  if (dim === "trigger") return row.key === "manual" ? "Manual (someone asked)" : "Automated (ran on its own)";
  return row.label || row.key;
}

/** Where an identity opens, or null when the value is not an entity. */
export function identityHref(dim: SpendDimension, key: string): string | null {
  if (key === SPEND_NONE_KEY) return null;
  switch (dim) {
    case "organization":
      return `/organizations/${key}`;
    case "user":
      return `/administration/users?focus=${key}`;
    case "agent":
      return `/administration/agents/system-agents/agents/${key}`;
    case "conversation":
      return `/chat/${key}`;
    default:
      return null;
  }
}

/** `1.2M` / `340k` / `812` — tokens are read at a glance, never as 9 digits. */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

export function percent(share: number): string {
  if (!Number.isFinite(share)) return "—";
  const p = share * 100;
  if (p > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

/** `2026-09-11T17:00` → `Sep 11, 5 PM`; `2026-09-11` → `Sep 11`. */
export function shortLocal(at: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(at);
  if (!m) return at;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0));
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (m[4] === undefined) return day;
  const hour = date.toLocaleTimeString(undefined, { hour: "numeric" });
  return `${day}, ${hour}`;
}
