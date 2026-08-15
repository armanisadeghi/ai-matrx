/**
 * Persistence for guided checklists — direct Supabase, per the data-flow rule
 * (a plain row read/write never goes through the Python server).
 *
 * One row per (org, checklist, target) in `platform.guided_checklist_run`.
 *
 * Writes are read-modify-write on a JSONB map that TWO PEOPLE CAN EDIT AT ONCE
 * (one teammate ticks the DNS step while another ticks the mailbox step), so
 * every write is version-guarded through the platform's optimistic-concurrency
 * primitive and, on conflict, re-applies the same mutation to the row that
 * actually landed. Last-write-wins here would silently swallow a colleague's
 * confirmation — the exact class of bug the guard exists for.
 */

import { createClient } from "@/utils/supabase/client";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import { EMPTY_RUN_STATE } from "./engine";
import type { ChecklistRun, ChecklistRunState, ChecklistScope } from "./types";

const COLUMNS =
  "id, checklist_key, target_key, organization_id, state, completed_at, dismissed_at, created_at, updated_at, version";

interface RunRow {
  id: string;
  checklist_key: string;
  target_key: string;
  organization_id: string;
  state: unknown;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

/** Distinguishes first-run INSERT failures from failures reading an existing run. */
export class ChecklistRunCreateError extends Error {
  constructor(cause: unknown) {
    super("Could not create the saved checklist run.", { cause });
    this.name = "ChecklistRunCreateError";
  }
}

/**
 * `state` is JSONB — anything could be in there, including rows written by an
 * older shape of this module. Narrow defensively and drop what we cannot read
 * rather than letting a malformed blob crash the surface it is meant to unblock.
 */
export function parseRunState(raw: unknown): ChecklistRunState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_RUN_STATE;
  }
  const steps = (raw as { steps?: unknown }).steps;
  if (!steps || typeof steps !== "object" || Array.isArray(steps)) {
    return EMPTY_RUN_STATE;
  }
  const out: ChecklistRunState["steps"] = {};
  for (const [id, value] of Object.entries(steps as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const last = entry.lastResult;
    out[id] = {
      confirmedAt:
        typeof entry.confirmedAt === "string" ? entry.confirmedAt : undefined,
      confirmedBy:
        typeof entry.confirmedBy === "string" ? entry.confirmedBy : undefined,
      ranAt: typeof entry.ranAt === "string" ? entry.ranAt : undefined,
      lastResult:
        last && typeof last === "object" && !Array.isArray(last)
          ? {
              status: (last as { status?: unknown }).status as never,
              reason:
                typeof (last as { reason?: unknown }).reason === "string"
                  ? ((last as { reason: string }).reason)
                  : undefined,
              at:
                typeof (last as { at?: unknown }).at === "string"
                  ? (last as { at: string }).at
                  : new Date(0).toISOString(),
            }
          : undefined,
    };
  }
  return { steps: out };
}

function toRun(row: RunRow): ChecklistRun & { version: number } {
  return {
    id: row.id,
    checklistKey: row.checklist_key,
    targetKey: row.target_key,
    organizationId: row.organization_id,
    state: parseRunState(row.state),
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function table() {
  return createClient().schema("platform").from("guided_checklist_run");
}

/** The live run for this checklist + target, or null if never started. */
export async function loadRun(
  checklistKey: string,
  scope: ChecklistScope,
): Promise<(ChecklistRun & { version: number }) | null> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("checklist_key", checklistKey)
    .eq("target_key", scope.targetKey ?? "")
    .eq("organization_id", scope.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toRun(data as RunRow) : null;
}

/** Load the run, creating it on first visit. */
export async function loadOrCreateRun(
  checklistKey: string,
  scope: ChecklistScope,
): Promise<ChecklistRun & { version: number }> {
  const existing = await loadRun(checklistKey, scope);
  if (existing) return existing;

  const { data, error } = await table()
    .insert({
      checklist_key: checklistKey,
      target_key: scope.targetKey ?? "",
      organization_id: scope.organizationId,
      state: EMPTY_RUN_STATE as never,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // A parallel tab won the unique index — its row is the right answer.
    const raced = await loadRun(checklistKey, scope);
    if (raced) return raced;
    throw new ChecklistRunCreateError(error);
  }
  return toRun(data as RunRow);
}

export type StateMutation = (state: ChecklistRunState) => ChecklistRunState;

/**
 * Apply `mutate` to the run's state and save it.
 *
 * On a version conflict the mutation is re-applied to the row that actually
 * landed and retried once — correct because every mutation this module ships
 * touches ONE step's entry, so replaying it on a newer state preserves the
 * other writer's work instead of clobbering it. A second conflict throws
 * rather than looping.
 */
export async function saveRunState(
  run: ChecklistRun & { version: number },
  mutate: StateMutation,
  patch?: { completedAt?: string | null; dismissedAt?: string | null },
): Promise<ChecklistRun & { version: number }> {
  const attempt = async (
    current: ChecklistRun & { version: number },
  ): Promise<
    | { status: "saved"; run: ChecklistRun & { version: number } }
    | { status: "conflict"; current: ChecklistRun & { version: number } }
  > => {
    const nextState = mutate(current.state);
    const result = await guardedUpdate<RunRow>({
      expectedVersion: current.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        table()
          .update({
            state: nextState as never,
            version: nextVersion,
            ...(patch?.completedAt !== undefined
              ? { completed_at: patch.completedAt }
              : {}),
            ...(patch?.dismissedAt !== undefined
              ? { dismissed_at: patch.dismissedAt }
              : {}),
          })
          .eq("id", current.id)
          .eq("version", expectedVersion)
          .select(COLUMNS)
          .maybeSingle(),
      fetchCurrent: () =>
        table().select(COLUMNS).eq("id", current.id).maybeSingle(),
    });

    if (result.status === "saved") {
      return { status: "saved", run: toRun(result.row) };
    }
    if (result.status === "conflict") {
      return { status: "conflict", current: toRun(result.currentRow) };
    }
    // The row was hard-deleted underneath us. A checklist is disposable state:
    // start a fresh run rather than failing the user's click.
    const fresh = await loadOrCreateRun(current.checklistKey, {
      organizationId: current.organizationId,
      targetKey: current.targetKey,
    });
    return { status: "conflict", current: fresh };
  };

  const first = await attempt(run);
  if (first.status === "saved") return first.run;
  const second = await attempt(first.current);
  if (second.status === "saved") return second.run;
  throw new Error(
    "Could not save your checklist — someone else is editing it at the same moment. Try again.",
  );
}
