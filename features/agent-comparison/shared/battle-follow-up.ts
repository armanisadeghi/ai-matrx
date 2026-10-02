/**
 * THE ONE BATTLE FAN-OUT — every Agent Battle mode's Submit All runs through
 * `runBattleFanOut`, so a new mode inherits the follow-up rule.
 *
 * Submit All copies the shared composer into every column and sends it (or,
 * in the per-column modes, sends each column's own composer). A column that
 * has NOT run yet may start from the agent's variables alone — the server
 * renders the agent's own messages on turn one. A column that already ran
 * sends only `user_input` on its next turn, so an empty composer is an empty
 * follow-up that the send door refuses (`refusesEmptyTurn`, W-32). That
 * surfaced as one "failed" per column (Model Battle, 2026-10-01).
 *
 * The SAME rule the door applies decides it here, before anything is copied:
 * fresh columns fire; columns the door would refuse are held — they never
 * fire, so they never fail — and the shared composer says what to do
 * (`SharedBattleInput` reads `selectBattleFollowUpNotice`). Ruling 2026-10-01.
 * `__tests__/battle-fan-out-census.test.ts` fails a mode whose Submit All
 * fans out any other way.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  agentUserInputFromSubmission,
  captureSubmission,
  isEmptySubmission,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/frozen-submission";
import { refusesEmptyTurn } from "@ai-matrx/chat/agents/redux/execution-system/thunks/execute-instance.thunk";
import { selectMessageCount } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { copyInstanceRequestDraft } from "@ai-matrx/chat/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk";
import { smartExecute } from "@ai-matrx/chat/agents/redux/execution-system/thunks/smart-execute.thunk";
import {
  persistForRun,
  type BattleSubmitResult,
  type PersistedBattle,
} from "./battlePersistence";

export interface BattleFanOutPlan {
  /** Columns that start (or continue) from this Submit All. */
  fire: string[];
  /** Columns that already ran and would get an empty follow-up — held. */
  needFollowUp: string[];
}

/** True when the send door would refuse this column's turn as an empty follow-up. */
function wouldBeEmptyFollowUp(
  state: RootState,
  composerConversationId: string,
  columnConversationId: string,
): boolean {
  const conversation = state.conversations.byConversationId[columnConversationId];
  return refusesEmptyTurn({
    retry: false,
    hasPriorTurns: selectMessageCount(columnConversationId)(state) > 0,
    cacheOnly: conversation?.cacheOnly === true,
    isEphemeral: conversation?.isEphemeral === true,
    userInput: agentUserInputFromSubmission(
      captureSubmission(state, composerConversationId),
    ),
  });
}

/**
 * `sourceConversationId` is the shared composer every column receives; null
 * means each column sends its own composer (Open battle, Request mod).
 */
export function planBattleFanOut(
  state: RootState,
  sourceConversationId: string | null,
  columnConversationIds: readonly string[],
): BattleFanOutPlan {
  const plan: BattleFanOutPlan = { fire: [], needFollowUp: [] };
  for (const id of columnConversationIds) {
    const held = wouldBeEmptyFollowUp(state, sourceConversationId ?? id, id);
    (held ? plan.needFollowUp : plan.fire).push(id);
  }
  return plan;
}

/** The shared composer's line while a column that already ran waits for typed text. */
export const FOLLOW_UP_NEEDED_TEXT = "Type a follow-up to run again";

/**
 * The shared composer's line: shown while the composer is empty and Submit
 * All would hold at least one column that already ran. A string or null — a
 * primitive, so it needs no memo.
 */
export function selectBattleFollowUpNotice(
  state: RootState,
  sourceConversationId: string | null | undefined,
  columnConversationIds: readonly string[],
): string | null {
  if (!sourceConversationId || columnConversationIds.length === 0) return null;
  if (!isEmptySubmission(captureSubmission(state, sourceConversationId))) return null;
  return planBattleFanOut(state, sourceConversationId, columnConversationIds)
    .needFollowUp.length > 0
    ? FOLLOW_UP_NEEDED_TEXT
    : null;
}

export interface RunBattleFanOutOptions {
  dispatch: AppDispatch;
  getState: () => RootState;
  /** The shared composer copied into every column; null = each column sends its own. */
  sourceConversationId: string | null;
  /** The columns this Submit All targets (paused / empty ones already removed). */
  columns: readonly { conversationId: string }[];
  /** Columns the mode removed before the fan-out — reported as skipped. */
  skipped?: number;
  surfaceKey: string;
  /** Save the battle so the URL names it while the answers stream in. */
  persist: () => Promise<PersistedBattle>;
  /** Save again once every run has started (Model battle). */
  persistAfterRun?: boolean;
  /** Runs for the firing columns, before the save (Request mod keeps each request). */
  beforePersist?: (firing: readonly string[]) => void;
}

export async function runBattleFanOut({
  dispatch,
  getState,
  sourceConversationId,
  columns,
  skipped = 0,
  surfaceKey,
  persist,
  persistAfterRun = false,
  beforePersist,
}: RunBattleFanOutOptions): Promise<BattleSubmitResult> {
  const plan = planBattleFanOut(
    getState(),
    sourceConversationId,
    columns.map((c) => c.conversationId),
  );
  const needsFollowUp = plan.needFollowUp.length;
  const followUpInline = sourceConversationId !== null;
  if (plan.fire.length === 0) {
    return { launched: 0, failed: 0, skipped, needsFollowUp, followUpInline };
  }

  if (sourceConversationId) {
    for (const conversationId of plan.fire) {
      dispatch(
        copyInstanceRequestDraft({
          sourceConversationId,
          targetConversationId: conversationId,
        }),
      );
    }
  }
  beforePersist?.(plan.fire);

  const before = await persistForRun(persist);
  if (before.cancelled) {
    return {
      launched: 0,
      failed: 0,
      skipped: skipped + columns.length,
      cancelled: true,
    };
  }

  const results = await Promise.allSettled(
    plan.fire.map((conversationId) =>
      dispatch(smartExecute({ conversationId, surfaceKey })).unwrap(),
    ),
  );
  const failed = results.filter((r) => r.status === "rejected").length;

  const after = persistAfterRun ? await persistForRun(persist) : null;

  return {
    launched: results.length - failed,
    failed,
    skipped,
    needsFollowUp,
    followUpInline,
    persistError: before.error ?? after?.error ?? null,
  };
}
