// features/mandates/run-history/service.ts
//
// THE ONE READ of a mandate's run history — `public.mnd_run_history`
// (migrations/mnd_run_history_2026_09_27.sql). No new log: the database reads
// the records every funnel already writes (chat.user_request for agent/chat
// starts, held code calls and `run_mandate`; workflow.run for every workflow
// Holder run). Which level decided each run is stamped by aidream at the
// resolution (`mandates.service.mandate_run_stamp`); runs recorded before that
// stamp existed come back with `rung: null` — "not recorded", never a guess.
//
// Views are SEATS, and the database checks each one:
//   mine      the caller's own runs          (a member)
//   org       every run in one organization  (its owner/admin)
//   platform  every run on the platform      (admin section only — never "mine")

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { MandateDoorError } from "../door-error";

export type RunHistoryView = "mine" | "org" | "platform";
export type RunStatus = "succeeded" | "failed" | "stopped" | "waiting" | "running";
export type RunRung = "system" | "org" | "user" | "run";

export const RUN_STATUSES: readonly RunStatus[] = [
  "succeeded",
  "failed",
  "stopped",
  "waiting",
  "running",
];

export interface MandateRun {
  runKind: "conversation" | "workflow";
  runId: string;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  rawStatus: string | null;
  error: string | null;
  ranById: string | null;
  ranByName: string | null;
  ranByKind: "person" | "system";
  organizationId: string | null;
  organizationName: string | null;
  /** null = recorded before the level was stamped (2026-09-27). */
  rung: RunRung | null;
  holderType: "agent" | "workflow";
  holderId: string | null;
  holderName: string | null;
  holderAgentType: string | null;
  outputWarned: boolean;
  outputMissingKeys: string[];
  cost: number | null;
  durationMs: number | null;
  conversationId: string | null;
}

export interface RunFacet {
  id: string;
  name: string | null;
  count: number;
}

export interface MandateRunPage {
  total: number;
  rows: MandateRun[];
  facets: { organizations: RunFacet[]; people: RunFacet[] } | null;
}

export interface MandateRunQuery {
  mandateKey: string;
  view: RunHistoryView;
  organizationId?: string | null;
  userId?: string | null;
  status?: RunStatus | null;
  limit?: number;
  offset?: number;
}

export class MandateRunHistoryError extends MandateDoorError {
  constructor(init: { message: string; code?: string | null; detail?: string | null; hint?: string | null }) {
    super({
      ...init,
      name: "MandateRunHistoryError",
      fallback: "The run history could not be read and the database gave no reason.",
    });
  }
}

export async function fetchMandateRuns(query: MandateRunQuery): Promise<MandateRunPage> {
  const { data, error } = await supabase.rpc("mnd_run_history", {
    p_mandate_key: query.mandateKey,
    p_view: query.view,
    ...(query.organizationId ? { p_org_id: query.organizationId } : {}),
    ...(query.userId ? { p_user_id: query.userId } : {}),
    ...(query.status ? { p_status: query.status } : {}),
    p_limit: query.limit ?? 25,
    p_offset: query.offset ?? 0,
  });
  if (error) {
    throw new MandateRunHistoryError({
      message: error.message,
      code: error.code,
      detail: error.details,
      hint: error.hint,
    });
  }
  return parseRunPage(data);
}

// ── Shape guards: the RPC returns Json; every field is narrowed, never cast ──

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: Json | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function isStatus(value: string | null): value is RunStatus {
  return value !== null && (RUN_STATUSES as readonly string[]).includes(value);
}

function isRung(value: string | null): value is RunRung {
  return value === "system" || value === "org" || value === "user" || value === "run";
}

function parseRun(value: Json): MandateRun | null {
  if (!isObject(value)) return null;
  const runId = str(value.run_id);
  const startedAt = str(value.started_at);
  if (!runId || !startedAt) return null;
  const status = str(value.status);
  const rung = str(value.rung);
  const missing = Array.isArray(value.output_missing_keys)
    ? value.output_missing_keys.filter((item): item is string => typeof item === "string")
    : [];
  return {
    runKind: value.run_kind === "workflow" ? "workflow" : "conversation",
    runId,
    startedAt,
    completedAt: str(value.completed_at),
    status: isStatus(status) ? status : "running",
    rawStatus: str(value.raw_status),
    error: str(value.error),
    ranById: str(value.ran_by_id),
    ranByName: str(value.ran_by_name),
    ranByKind: value.ran_by_kind === "system" ? "system" : "person",
    organizationId: str(value.organization_id),
    organizationName: str(value.organization_name),
    rung: isRung(rung) ? rung : null,
    holderType: value.holder_type === "workflow" ? "workflow" : "agent",
    holderId: str(value.holder_id),
    holderName: str(value.holder_name),
    holderAgentType: str(value.holder_agent_type),
    outputWarned: value.output_warned === true || missing.length > 0,
    outputMissingKeys: missing,
    cost: num(value.cost),
    durationMs: num(value.duration_ms),
    conversationId: str(value.conversation_id),
  };
}

function parseFacets(value: Json | undefined): RunFacet[] {
  if (!Array.isArray(value)) return [];
  const out: RunFacet[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const id = str(item.id);
    if (!id) continue;
    out.push({ id, name: str(item.name), count: num(item.count) ?? 0 });
  }
  return out;
}

export function parseRunPage(data: Json | null): MandateRunPage {
  if (data === null || !isObject(data)) {
    throw new MandateRunHistoryError({ message: "The run history answer had no rows." });
  }
  const body = data;
  const rows = Array.isArray(body.rows)
    ? body.rows.map(parseRun).filter((row): row is MandateRun => row !== null)
    : [];
  const facets = isObject(body.facets)
    ? {
        organizations: parseFacets(body.facets.organizations),
        people: parseFacets(body.facets.people),
      }
    : null;
  return { total: num(body.total) ?? rows.length, rows, facets };
}
