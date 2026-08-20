/**
 * The FE-facing shape of a workflow trigger — the thing that makes a workflow
 * run WITHOUT a person present (a schedule, or an inbound webhook).
 *
 * 🚨 Not to be confused with `features/workflow-runtime/trigger-points.ts`:
 * that is a named MOMENT INSIDE a run that UI binds visibility to (ruling R2).
 * This file is about what STARTS a run. Same word, unrelated systems.
 *
 * The server's `TriggerRecord` is `extra="allow"`, so the generated type is a
 * bag of optionals plus an index signature. Rather than spraying casts at
 * every read site, `parseTrigger` narrows ONCE into the total shape below —
 * a real fix, never a suppression (see the `type-safety` skill).
 *
 * `webhook_secret` is deliberately absent: the server marks it `exclude=True`
 * on every response, so no read path can ever put it on screen. The plaintext
 * exists exactly once, in the browser that created it.
 */

export type TriggerKind = "cron" | "webhook" | "manual";

export interface WorkflowTrigger {
  id: string;
  definitionId: string;
  name: string;
  description: string | null;
  kind: TriggerKind;
  cronExpression: string | null;
  timezone: string;
  isActive: boolean;
  defaultInputs: Record<string, unknown>;
  maxSteps: number | null;
  /** ISO — when the schedule is next due. Null for webhook/manual. */
  nextRunAt: string | null;
  lastFiredAt: string | null;
  lastRunId: string | null;
  fireCount: number;
  createdAt: string | null;
}

export interface TriggerFire {
  id: string;
  triggerId: string;
  firedAt: string;
  runId: string | null;
  status: "queued" | "failed";
  errorType: string | null;
  errorMessage: string | null;
  firedByUserId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isTriggerKind(value: unknown): value is TriggerKind {
  return value === "cron" || value === "webhook" || value === "manual";
}

/** Narrow one wire row; returns null for anything without an identity. */
export function parseTrigger(raw: unknown): WorkflowTrigger | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const definitionId = str(raw.definition_id);
  if (!id || !definitionId) return null;
  return {
    id,
    definitionId,
    name: str(raw.name) ?? "Untitled",
    description: str(raw.description),
    kind: isTriggerKind(raw.kind) ? raw.kind : "manual",
    cronExpression: str(raw.cron_expression),
    timezone: str(raw.timezone) ?? "UTC",
    isActive: raw.is_active !== false,
    defaultInputs: isRecord(raw.default_inputs) ? raw.default_inputs : {},
    maxSteps: typeof raw.max_steps === "number" ? raw.max_steps : null,
    nextRunAt: str(raw.next_run_at),
    lastFiredAt: str(raw.last_fired_at),
    lastRunId: str(raw.last_run_id),
    fireCount: typeof raw.fire_count === "number" ? raw.fire_count : 0,
    createdAt: str(raw.created_at),
  };
}

export function parseTriggerList(raw: unknown): WorkflowTrigger[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseTrigger)
    .filter((t): t is WorkflowTrigger => t !== null);
}

export function parseTriggerFire(raw: unknown): TriggerFire | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const triggerId = str(raw.trigger_id);
  const firedAt = str(raw.fired_at);
  if (!id || !triggerId || !firedAt) return null;
  return {
    id,
    triggerId,
    firedAt,
    runId: str(raw.run_id),
    status: raw.status === "failed" ? "failed" : "queued",
    errorType: str(raw.error_type),
    errorMessage: str(raw.error_message),
    firedByUserId: str(raw.fired_by_user_id),
  };
}

export function parseTriggerFireList(raw: unknown): TriggerFire[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseTriggerFire).filter((f): f is TriggerFire => f !== null);
}
