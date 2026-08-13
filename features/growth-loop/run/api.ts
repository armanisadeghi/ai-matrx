/**
 * THE GROWTH LOOP RUN — client half of the run object.
 *
 * Reads AND actions both go to aidream's `/growth-loop/*` routes today, and
 * that is deliberate, not an oversight of the "reads go direct to Supabase"
 * rule: the `growth` schema is NOT in this project's PostgREST exposure list
 * (`PGRST106: Invalid schema: growth`), so `supabase.schema("growth")` cannot
 * reach `growth.v_loop_state` at all. Until that schema is exposed there is
 * exactly ONE reachable path, which is the one this module uses — no second
 * candidate, no fallback ladder. When `growth` IS exposed, the four read
 * functions here move to `growth.v_loop_state` / `growth.loop_event` and the
 * mutations stay here (real orchestration work), per the client/server rule in
 * CLAUDE.md. Tracked as G-ORCHESTRATOR-READ in `../map/loop-map.ts`.
 *
 * Every type below is DERIVED from `types/python-generated/api-types.ts`.
 * Nothing here hand-mirrors a server shape.
 */

import { callApi } from "@/lib/api/call-api";
import type { components, paths } from "@/types/python-generated/api-types";
import type { AppDispatch } from "@/lib/redux/store";

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

/** The 200 JSON body of one contract operation — derived, never asserted. */
type Json200<P extends keyof paths, M extends string> = paths[P] extends Record<
  M,
  infer Op
>
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every loop this site has ever run, newest first per the server. */
export async function listSiteLoops(
  dispatch: AppDispatch,
  siteId: string,
  signal?: AbortSignal,
): Promise<LoopStateView[]> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/sites/{site_id}/runs",
      method: "GET",
      pathParams: { site_id: siteId },
      signal,
    }),
  );
  return unwrap<"/growth-loop/sites/{site_id}/runs", "get">(
    result,
    "List site loops",
  );
}

export async function getLoopState(
  dispatch: AppDispatch,
  loopRunId: string,
  signal?: AbortSignal,
): Promise<LoopStateView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/runs/{loop_run_id}",
      method: "GET",
      pathParams: { loop_run_id: loopRunId },
      signal,
    }),
  );
  return unwrap<"/growth-loop/runs/{loop_run_id}", "get">(result, "Loop state");
}

/**
 * Delta-poll the loop's own ledger. `afterSeq` is a gap-free per-loop sequence
 * assigned by a DB trigger — never a timestamp — so a poll can never miss or
 * re-read an event.
 */
export async function getLoopHistory(
  dispatch: AppDispatch,
  loopRunId: string,
  afterSeq: number,
  signal?: AbortSignal,
): Promise<LoopHistoryView> {
  const result = await dispatch(
    callApi({
      path: "/growth-loop/runs/{loop_run_id}/history",
      method: "GET",
      pathParams: { loop_run_id: loopRunId },
      queryParams: { after_seq: afterSeq, limit: 200 },
      signal,
    }),
  );
  return unwrap<"/growth-loop/runs/{loop_run_id}/history", "get">(
    result,
    "Loop history",
  );
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
