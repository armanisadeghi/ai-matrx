// features/administration/final-switch/finalSwitch.ts — THE FINAL SWITCH: THE ONE CLIENT.
//
// Arman, 2026-09-26: "I don't want to do this one org at a time. We will switch everything over once
// we know it works and it's done. Old gone, new in place." (lane FINAL-SWITCH)
//
// The database owns all of it (matrx-frontend migrations/campaign/finalswitch_*.sql):
//
//   platform.final_switch_readiness()  — every organization's readiness, measured now: what copying
//                                        again clears, what it cannot (named), scopes parity, follow
//                                        lag; the platform's own checks; after a run, the undo's plan.
//   platform.final_switch_state()      — on or off, since when, by whom (every screen reads it).
//
// The press and the undo run through the server's admin door (aidream /cutover/final-switch/*),
// because the press copies again first (the mover, Python) and switches every organization in one
// transaction that takes longer than a browser request may run. The database still decides who may
// press and refuses while anything is not ready; this file adds no rule of its own.

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import { createClient } from "@/utils/supabase/client";
import type {
  CutoverCopyAgainProgressData,
  CutoverFinalSwitchResultData,
  CutoverFinalSwitchStageData,
  TypedStreamEvent,
} from "@/types/python-generated/stream-events";

export type FinalSwitchCheck = {
  key: string;
  says: string;
  met: boolean;
  detail: string | null;
  fix?: string | null;
  measured_at?: string | null;
};

export type FinalSwitchDifference = {
  switch: string;
  key: string;
  says: string;
  detail: string | null;
  clears: number;
  leaves?: number;
};

export type FinalSwitchOrganization = {
  id: string;
  name: string;
  created_at: string;
  archived: boolean;
  tables: { live: number; copied: string | null; state: "old" | "new"; switched_at: string | null };
  lists: { live: number; copied: string | null };
  scopes: { types: number; state: "old" | "new"; switched_at: string | null; parity: string | null };
  follow_lag: number;
  rerun_clears: FinalSwitchDifference[];
  cannot_clear: FinalSwitchDifference[];
  needs_copy_again: boolean;
  ready: boolean;
  plan: { press_tables: boolean; sweep_tables: number; sweep_lists: number; press_context: boolean };
};

export type FinalSwitchUndoPlanRow = {
  id: string;
  name: string;
  carries?: string[];
  not_carried?: string[];
  needs_confirm?: boolean;
  skipped?: string;
};

export type FinalSwitchBoard = {
  checkedAt: string;
  state: "old" | "new";
  lastRun: {
    id: string;
    direction: "old" | "new";
    at: string;
    says: string | null;
    by: string | null;
    counts: Record<string, number> | null;
  } | null;
  platform: FinalSwitchCheck[];
  organizations: FinalSwitchOrganization[];
  totals: { organizations: number; ready: number; need_copy_again: number; blocked: number };
  blocking: string[];
  ready: boolean;
  readyAfterCopyAgain: boolean;
  says: string;
  mayPress: boolean;
  mayUndo: boolean;
  undo: { plan: FinalSwitchUndoPlanRow[]; needs_confirm: boolean } | null;
};

type RawBoard =
  | {
      ok: true;
      checked_at: string;
      state: "old" | "new";
      last_run: FinalSwitchBoard["lastRun"];
      platform: FinalSwitchCheck[];
      organizations: FinalSwitchOrganization[];
      totals: FinalSwitchBoard["totals"];
      blocking: string[];
      ready: boolean;
      ready_after_copy_again: boolean;
      says: string;
      may_press?: boolean;
      may_undo?: boolean;
      undo: FinalSwitchBoard["undo"];
    }
  | { ok: false; reason: string; says: string };

function platformRpc() {
  const client = createClient();
  // The doors are new; until the generated database types carry them the call is typed by its answer.
  return client.schema("platform" as never) as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/** Every organization's readiness for the final switch. Throws with the door's own sentence. */
export async function readFinalSwitch(): Promise<FinalSwitchBoard> {
  const { data, error } = await platformRpc().rpc("final_switch_readiness", {});
  if (error) throw new Error(`The final switch could not be read: ${error.message}`);
  const raw = data as RawBoard | null;
  if (!raw) throw new Error("The final switch could not be read: the database answered nothing.");
  if (!raw.ok) throw new Error(raw.says);
  return {
    checkedAt: raw.checked_at,
    state: raw.state,
    lastRun: raw.last_run,
    platform: raw.platform ?? [],
    organizations: raw.organizations ?? [],
    totals: raw.totals,
    blocking: raw.blocking ?? [],
    ready: raw.ready,
    readyAfterCopyAgain: raw.ready_after_copy_again,
    says: raw.says,
    mayPress: Boolean(raw.may_press),
    mayUndo: Boolean(raw.may_undo),
    undo: raw.undo ?? null,
  };
}

/** Sort for the table: what blocks first, then what copying again clears, then the ready. */
export function organizationOrder(o: FinalSwitchOrganization): number {
  if (o.cannot_clear.length > 0) return 0;
  if (o.rerun_clears.length > 0) return 1;
  if (o.plan.press_tables || o.plan.press_context || o.plan.sweep_lists + o.plan.sweep_tables > 0) return 2;
  return 3;
}

export type FinalSwitchProgress = { kind: "stage" | "table"; says: string };

export type FinalSwitchAnswer =
  | { ok: true; says: string; result: CutoverFinalSwitchResultData }
  | { ok: false; says: string; reason?: string | null; result?: CutoverFinalSwitchResultData };

function isStage(d: unknown): d is CutoverFinalSwitchStageData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "cutover_final_switch_stage";
}
function isResult(d: unknown): d is CutoverFinalSwitchResultData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "cutover_final_switch_result";
}
function isCopyProgress(d: unknown): d is CutoverCopyAgainProgressData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "cutover_copy_again_progress";
}

function readAnswer(
  result: { error?: { serverDetail?: unknown; message: string } | null },
  done: CutoverFinalSwitchResultData | null,
  refusal: string | null,
  fallback: string,
): FinalSwitchAnswer {
  if (result.error) {
    const detail = result.error.serverDetail;
    const says =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && typeof (detail as { detail?: unknown }).detail === "string"
          ? (detail as { detail: string }).detail
          : result.error.message;
    return { ok: false, says: says || fallback };
  }
  if (refusal) return { ok: false, says: refusal };
  if (!done) return { ok: false, says: `${fallback} It ended without saying what it did; check again to see where it stands.` };
  return done.ok
    ? { ok: true, says: done.says, result: done }
    : { ok: false, says: done.says, reason: done.reason, result: done };
}

function streamHandlers(onProgress?: (p: FinalSwitchProgress) => void) {
  const state: { done: CutoverFinalSwitchResultData | null; refusal: string | null } = { done: null, refusal: null };
  const onStreamEvent = (event: TypedStreamEvent) => {
    if (event.event === "data") {
      const d = event.data as unknown;
      if (isStage(d)) onProgress?.({ kind: "stage", says: d.says });
      else if (isCopyProgress(d)) onProgress?.({ kind: "table", says: d.says });
      else if (isResult(d)) state.done = d;
    } else if (event.event === "error") {
      const e = event.data as { user_message?: string | null; message?: string };
      state.refusal = e.user_message || e.message || "The final switch was refused.";
    }
  };
  return { state, onStreamEvent };
}

/** Copy again where it clears something, then switch every organization at once. */
export async function pressFinalSwitch(
  dispatch: AppDispatch,
  note: string | null,
  onProgress?: (p: FinalSwitchProgress) => void,
): Promise<FinalSwitchAnswer> {
  const { state, onStreamEvent } = streamHandlers(onProgress);
  const result = await dispatch(
    callApi({
      path: "/cutover/final-switch/press",
      method: "POST",
      body: { note },
      stream: true,
      expectedErrorStatuses: [400, 401, 403],
      onStreamEvent,
    }),
  );
  return readAnswer(result, state.done, state.refusal, "The final switch did not start.");
}

/** The one undo: every organization back, in the same order backwards. */
export async function undoFinalSwitch(
  dispatch: AppDispatch,
  acceptNotCarried: boolean,
  onProgress?: (p: FinalSwitchProgress) => void,
): Promise<FinalSwitchAnswer> {
  const { state, onStreamEvent } = streamHandlers(onProgress);
  const result = await dispatch(
    callApi({
      path: "/cutover/final-switch/undo",
      method: "POST",
      body: { note: null, accept_not_carried: acceptNotCarried },
      stream: true,
      expectedErrorStatuses: [400, 401, 403],
      onStreamEvent,
    }),
  );
  return readAnswer(result, state.done, state.refusal, "The undo did not start.");
}
