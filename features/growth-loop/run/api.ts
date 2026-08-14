/**
 * THE GROWTH LOOP RUN — client half of the run object.
 *
 * Reads go DIRECT to Supabase under the caller's JWT. Actions stay on
 * aidream's `/growth-loop/*` routes because they are orchestration work, not
 * database CRUD. There is one path per operation and no fallback ladder.
 *
 * Public shapes are derived from `types/python-generated/api-types.ts`; raw
 * rows are derived from `types/database.types.ts`. Nothing hand-mirrors either
 * boundary.
 */

import { callApi } from "@/lib/api/call-api";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { Database } from "@/types/database.types";
import type { components, paths } from "@/types/python-generated/api-types";
import type { AppDispatch } from "@/lib/redux/store";
import { STAGES } from "../map/loop-map";

export type LoopStateView = components["schemas"]["LoopStateView"];
export type LoopHistoryView = components["schemas"]["LoopHistoryView"];
export type LoopEventView = components["schemas"]["LoopEventView"];
export type StageRunView = components["schemas"]["StageRunView"];
export type Blocker = components["schemas"]["Blocker"];
export type StageRef = components["schemas"]["StageRef"];
export type LoopStageId = components["schemas"]["LoopStage"];
export type StageRefKind = components["schemas"]["StageRefKind"];
export type BlockerKind = components["schemas"]["BlockerKind"];
export type LoopStatus = components["schemas"]["LoopStatus"];
export type StageRunStatus = components["schemas"]["StageRunStatus"];
export type PipeRequest = components["schemas"]["PipeRequest"];
export type LoopControlAction =
  components["schemas"]["LoopControlRequest"]["action"];

type LoopStateRow = Database["growth"]["Views"]["v_loop_state"]["Row"];
type StageRunRow = Database["growth"]["Tables"]["loop_stage_run"]["Row"];

/** The 200 JSON body of one contract operation — derived, never asserted. */
type Json200<P extends keyof paths, M extends string> =
  paths[P] extends Record<M, infer Op>
    ? Op extends {
        responses: { 200: { content: { "application/json": infer R } } };
      }
      ? R
      : never
    : never;

export class GrowthLoopApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GrowthLoopApiError";
    this.status = status;
  }
}

/**
 * The ONE seam where an untyped `ApiCallResult.data` becomes a contract type.
 * `callApi` resolves its body from `paths` but returns `data?: unknown`; this
 * narrows it once, from the same generated contract, instead of every call
 * site asserting its own shape.
 */
function unwrap<P extends keyof paths, M extends string>(
  result: { data?: unknown; error?: { message: string; status?: number } },
  what: string,
): Json200<P, M> {
  if (result.error) {
    throw new GrowthLoopApiError(result.error.message, result.error.status);
  }
  if (result.data === undefined || result.data === null) {
    throw new GrowthLoopApiError(`${what} returned no body.`);
  }
  return result.data as Json200<P, M>;
}

async function growthDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("growth");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GrowthLoopApiError(`Growth loop data is missing ${field}.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GrowthLoopApiError(`Growth loop data is missing ${field}.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new GrowthLoopApiError(`Growth loop data is missing ${field}.`);
  }
  return value;
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GrowthLoopApiError(`Growth loop ${field} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function nullableJsonObject(
  value: unknown,
  field: string,
): Record<string, unknown> | null {
  return value === null ? null : jsonObject(value, field);
}

function optionalString(
  object: Record<string, unknown>,
  field: string,
): string | null {
  const value = object[field];
  return typeof value === "string" ? value : null;
}

function stageId(value: unknown, field: string): LoopStageId {
  const id = requiredString(value, field);
  if (!STAGES.some((stage) => stage.id === id)) {
    throw new GrowthLoopApiError(
      `Growth loop ${field} has unknown value ${id}.`,
    );
  }
  return id as LoopStageId;
}

function blockerFromRow(row: {
  blocker: unknown;
  blocker_kind: string | null;
  escalate_at: string | null;
  escalate_to_pipe: string | null;
}): Blocker | null {
  if (!row.blocker_kind) return null;
  const raw = jsonObject(row.blocker ?? {}, "blocker");
  return {
    kind: row.blocker_kind as BlockerKind,
    detail: optionalString(raw, "detail") ?? "",
    since: optionalString(raw, "since"),
    assist_id: optionalString(raw, "assist_id"),
    resume_hint: optionalString(raw, "resume_hint"),
    escalate_at: row.escalate_at,
    escalate_to_pipe: row.escalate_to_pipe as Blocker["escalate_to_pipe"],
  };
}

function stageRunFromRow(row: StageRunRow): StageRunView {
  return {
    id: row.id,
    cycle: row.cycle,
    stage: stageId(row.stage, "stage"),
    attempt: row.attempt,
    status: row.status as StageRunStatus,
    pipe_requested: row.pipe_requested as PipeRequest,
    pipe: row.pipe as StageRunView["pipe"],
    blocker: blockerFromRow(row),
    ref:
      row.ref_kind && row.ref_id
        ? { kind: row.ref_kind as StageRefKind, id: row.ref_id }
        : null,
    outcome: nullableJsonObject(row.outcome, "stage outcome"),
    error: nullableJsonObject(row.error, "stage error"),
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

function stateFromRow(
  row: LoopStateRow,
  stageRuns: ReadonlyMap<string, StageRunView>,
): LoopStateView {
  const currentStage = stageId(row.current_stage, "current_stage");
  const position = STAGES.findIndex((stage) => stage.id === currentStage);
  const openStage = row.stage_run_id ? stageRuns.get(row.stage_run_id) : null;
  if (row.stage_run_id && !openStage) {
    throw new GrowthLoopApiError(
      `Growth loop ${row.loop_run_id ?? "(unknown)"} is missing its open stage.`,
    );
  }

  return {
    loop_run_id: requiredString(row.loop_run_id, "loop_run_id"),
    site_id: requiredString(row.site_id, "site_id"),
    site_name: row.site_name,
    site_domain: row.site_domain,
    label: row.label,
    status: requiredString(row.status, "status") as LoopStatus,
    current_stage: currentStage,
    stage_position: position + 1,
    stage_count: STAGES.length,
    cycle: requiredNumber(row.cycle, "cycle"),
    is_blocked: requiredBoolean(row.is_blocked, "is_blocked"),
    blocker: openStage?.blocker ?? null,
    open_stage: openStage,
    wf_run_id: row.wf_run_id,
    wf_run_status: row.wf_run_status,
    stages_completed_this_cycle: row.stages_completed_this_cycle ?? 0,
    event_seq: requiredNumber(row.event_seq, "event_seq"),
    error: nullableJsonObject(row.error, "error"),
    pipe_policy: jsonObject(
      row.pipe_policy,
      "pipe_policy",
    ) as LoopStateView["pipe_policy"],
    started_at: row.started_at,
    ended_at: row.ended_at,
    updated_at: row.updated_at,
  };
}

async function stageRunsForStates(
  rows: LoopStateRow[],
  signal?: AbortSignal,
): Promise<Map<string, StageRunView>> {
  const ids = rows.flatMap((row) =>
    row.stage_run_id ? [row.stage_run_id] : [],
  );
  if (ids.length === 0) return new Map();

  const response = await (
    await growthDb()
  )
    .from("loop_stage_run")
    .select("*")
    .in("id", ids)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) {
    throw new GrowthLoopApiError(
      `Open growth-loop stages could not be loaded: ${response.error.message}`,
    );
  }
  return new Map(
    (response.data ?? []).map((row) => {
      const stage = stageRunFromRow(row);
      return [stage.id, stage] as const;
    }),
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every loop this site has ever run, newest first. */
export async function listSiteLoops(
  siteId: string,
  signal?: AbortSignal,
): Promise<LoopStateView[]> {
  const response = await (
    await growthDb()
  )
    .from("v_loop_state")
    .select("*")
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) {
    throw new GrowthLoopApiError(
      `This site's growth loops could not be loaded: ${response.error.message}`,
    );
  }
  const rows = response.data ?? [];
  const stageRuns = await stageRunsForStates(rows, signal);
  return rows.map((row) => stateFromRow(row, stageRuns));
}

export async function getLoopState(
  loopRunId: string,
  signal?: AbortSignal,
): Promise<LoopStateView> {
  const response = await (
    await growthDb()
  )
    .from("v_loop_state")
    .select("*")
    .eq("loop_run_id", loopRunId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) {
    throw new GrowthLoopApiError(
      `Growth loop state could not be loaded: ${response.error.message}`,
    );
  }
  if (!response.data) {
    throw new GrowthLoopApiError(`No growth loop run ${loopRunId}.`, 404);
  }
  const stageRuns = await stageRunsForStates([response.data], signal);
  return stateFromRow(response.data, stageRuns);
}

/**
 * Delta-poll the loop's own ledger. `afterSeq` is a gap-free per-loop sequence
 * assigned by a DB trigger — never a timestamp — so a poll can never miss or
 * re-read an event.
 */
export async function getLoopHistory(
  loopRunId: string,
  afterSeq: number,
  signal?: AbortSignal,
): Promise<LoopHistoryView> {
  const response = await (
    await growthDb()
  )
    .from("loop_event")
    .select(
      "id, seq, event_type, cycle, stage, stage_run_id, payload, created_at",
    )
    .eq("loop_run_id", loopRunId)
    .gt("seq", afterSeq)
    .order("seq", { ascending: true })
    .limit(200)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) {
    throw new GrowthLoopApiError(
      `Growth loop history could not be loaded: ${response.error.message}`,
    );
  }

  const events: LoopEventView[] = (response.data ?? []).map((row) => ({
    id: row.id,
    seq: row.seq,
    event_type: row.event_type as LoopEventView["event_type"],
    cycle: row.cycle,
    stage: row.stage ? stageId(row.stage, "event stage") : null,
    stage_run_id: row.stage_run_id,
    payload: jsonObject(row.payload, "event payload"),
    created_at: row.created_at,
  }));
  return {
    loop_run_id: loopRunId,
    events,
    next_after_seq: events.at(-1)?.seq ?? afterSeq,
  };
}

// ---------------------------------------------------------------------------
// Actions — real orchestration work, always the server's job
// ---------------------------------------------------------------------------

/**
 * Start the site's loop. Idempotent on the server: a site that already has a
 * live loop gets that loop back rather than a second one (partial unique index
 * `loop_run_one_live_per_site`), which is why the button never needs a guard.
 * Omitting `pipe_policy` takes aidream's `default_policy()` — human first, AI
 * after an hour, with realize/serve/crawl/measure pinned to code.
 */
export async function startLoop(
  dispatch: AppDispatch,
  input: { siteId: string; label?: string | null },
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/runs",
      method: "POST",
      body: { site_id: input.siteId, label: input.label ?? null },
    }),
  );
  return unwrap<"/growth-loop/runs", "post">(result, "Start loop");
}

/** Open a stage. `pipe` forces this attempt onto one pipe (the owner taking over). */
export async function enterStage(
  dispatch: AppDispatch,
  input: {
    loopRunId: string;
    stage: LoopStageId;
    pipe?: components["schemas"]["Pipe"] | null;
  },
): Promise<StageRunView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/runs/{loop_run_id}/stages",
      method: "POST",
      pathParams: { loop_run_id: input.loopRunId },
      body: { stage: input.stage, pipe: input.pipe ?? null },
    }),
  );
  return unwrap<"/growth-loop/runs/{loop_run_id}/stages", "post">(
    result,
    "Enter stage",
  );
}

export async function completeStage(
  dispatch: AppDispatch,
  input: {
    stageRunId: string;
    outcome?: Record<string, never> | { [key: string]: unknown } | null;
    nextStage?: LoopStageId | null;
  },
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/stages/complete",
      method: "POST",
      body: {
        stage_run_id: input.stageRunId,
        outcome: input.outcome ?? null,
        next_stage: input.nextStage ?? null,
      },
    }),
  );
  return unwrap<"/growth-loop/stages/complete", "post">(
    result,
    "Complete stage",
  );
}

export async function blockStage(
  dispatch: AppDispatch,
  input: { stageRunId: string; kind: BlockerKind; detail: string },
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/stages/block",
      method: "POST",
      body: {
        stage_run_id: input.stageRunId,
        blocker: { kind: input.kind, detail: input.detail },
      },
    }),
  );
  return unwrap<"/growth-loop/stages/block", "post">(result, "Block stage");
}

/** Note the asymmetry the server chose: id in the path, reason in the QUERY. */
export async function unblockStage(
  dispatch: AppDispatch,
  input: { stageRunId: string; reason?: string },
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/stages/{stage_run_id}/unblock",
      method: "POST",
      pathParams: { stage_run_id: input.stageRunId },
      queryParams: input.reason ? { reason: input.reason } : undefined,
    }),
  );
  return unwrap<"/growth-loop/stages/{stage_run_id}/unblock", "post">(
    result,
    "Unblock stage",
  );
}

export async function skipStage(
  dispatch: AppDispatch,
  input: { stageRunId: string; reason: string },
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/stages/{stage_run_id}/skip",
      method: "POST",
      pathParams: { stage_run_id: input.stageRunId },
      queryParams: { reason: input.reason },
    }),
  );
  return unwrap<"/growth-loop/stages/{stage_run_id}/skip", "post">(
    result,
    "Skip stage",
  );
}

export async function controlLoop(
  dispatch: AppDispatch,
  input: { loopRunId: string; action: LoopControlAction; reason?: string },
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/runs/{loop_run_id}/control",
      method: "POST",
      pathParams: { loop_run_id: input.loopRunId },
      body: { action: input.action, reason: input.reason ?? null },
    }),
  );
  return unwrap<"/growth-loop/runs/{loop_run_id}/control", "post">(
    result,
    "Control loop",
  );
}

/** Re-derive the loop's status from its stage rows. The one-click "it's stuck" fix. */
export async function reconcileLoop(
  dispatch: AppDispatch,
  loopRunId: string,
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/runs/{loop_run_id}/reconcile",
      method: "POST",
      pathParams: { loop_run_id: loopRunId },
    }),
  );
  return unwrap<"/growth-loop/runs/{loop_run_id}/reconcile", "post">(
    result,
    "Reconcile loop",
  );
}
