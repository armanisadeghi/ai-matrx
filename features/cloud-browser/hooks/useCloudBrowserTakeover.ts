"use client";

/**
 * useCloudBrowserTakeover — "I'm taking the wheel", told to the agent the same
 * way a mid-run chat message is (Arman 2026-08-21).
 *
 * The chat composer already solved "the user wants to say something while the
 * agent is working": the Turn-Boundary Inbox (STEER — wait for the agent's own
 * natural boundary) and the interrupt fork (INTERRUPT — stop it now). Taking
 * control of a browser the agent is driving is the SAME duality, so it reuses
 * the SAME mechanisms rather than inventing a second signalling path:
 *
 *   DEFAULT (steer)     `enqueueInboxMessage({mode:"steer"})` — a system note
 *                       rides in with the agent's next tool result. While it
 *                       waits the user sees "…telling your agent you're taking
 *                       over" and a way out. Control transfers the moment the
 *                       note is delivered (`injection_consumed` retires the
 *                       card) or the run ends, whichever comes first.
 *   ESCAPE  (interrupt) `cancelExecution` — the run stops now, the still-
 *                       pending steer note is retracted, and a `turn_end` note
 *                       tells the agent's NEXT turn what happened and why
 *                       (`cancelExecution` carries no reason of its own).
 *
 * With NO bound conversation, or with nothing in flight, there is nothing to
 * steer — control transfers immediately. Waiting on an idle agent would be a
 * lie, and a spinner is never the answer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  enqueueInboxMessage,
  retractInboxItem,
} from "@/features/agents/redux/execution-system/inbox/inbox.thunks";
import { selectInboxItemStatus } from "@/features/agents/redux/execution-system/inbox/inbox.selectors";
import { cancelExecution } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { toast } from "@/lib/toast";
import {
  TAKEOVER_INTERRUPT_NOTE,
  TAKEOVER_STEER_NOTE,
} from "../constants";

/**
 * `idle` — the agent (or nobody) drives and no takeover is in motion.
 * `notifying` — the steer note is waiting for the agent's turn boundary; this
 *   is the ONLY phase that renders the wait notice + the immediate escape.
 * `claiming` — the browser claim is in flight (either path).
 */
export type TakeoverPhase = "idle" | "notifying" | "claiming";

export interface UseCloudBrowserTakeoverArgs {
  /** The chat this browser run belongs to. Without it there is nothing to
   *  steer — every takeover is immediate. */
  conversationId: string | null | undefined;
  /**
   * The agent itself asked for a person (`handoff.state === "requested"`).
   * Steering here would deadlock: the agent is already parked waiting for the
   * human and will never reach another turn boundary until they act. Control
   * transfers immediately — there is nothing to be non-disruptive about.
   */
  agentAwaitingHuman?: boolean;
  /** Actually claim the browser. Owned by the caller (claim + open the control
   *  stream); this hook owns only WHEN it runs. */
  claim: () => Promise<void>;
}

export interface UseCloudBrowserTakeover {
  phase: TakeoverPhase;
  /** True while the agent is being told and control has not moved yet. */
  waiting: boolean;
  /** The default, non-disruptive path. */
  begin: () => void;
  /** The escape hatch shown during `notifying`. */
  takeOverImmediately: () => void;
}

export function useCloudBrowserTakeover({
  conversationId,
  agentAwaitingHuman = false,
  claim,
}: UseCloudBrowserTakeoverArgs): UseCloudBrowserTakeover {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [phase, setPhase] = useState<TakeoverPhase>("idle");
  const [pendingInjectionId, setPendingInjectionId] = useState<string | null>(
    null,
  );

  const isExecuting = useAppSelector(
    selectIsExecuting(conversationId ?? "__none__"),
  );
  const noteStatus = useAppSelector(
    selectInboxItemStatus(conversationId ?? "__none__", pendingInjectionId ?? "__none__"),
  );

  // One claim per takeover, whichever trigger gets there first.
  const claimedRef = useRef(false);

  const runClaim = useCallback(async () => {
    if (claimedRef.current) return;
    claimedRef.current = true;
    setPhase("claiming");
    try {
      await claim();
    } finally {
      setPendingInjectionId(null);
      setPhase("idle");
      claimedRef.current = false;
    }
  }, [claim]);

  const begin = useCallback(() => {
    if (phase !== "idle") return;
    const state = store.getState();
    const nothingToSteer =
      agentAwaitingHuman ||
      !conversationId ||
      !selectIsExecuting(conversationId)(state);
    if (nothingToSteer) {
      void runClaim();
      return;
    }

    setPhase("notifying");
    void (async () => {
      try {
        const { injectionId } = await dispatch(
          enqueueInboxMessage({
            conversationId,
            text: TAKEOVER_STEER_NOTE,
            mode: "steer",
            kind: "system_message",
          }),
        ).unwrap();
        setPendingInjectionId(injectionId);
      } catch {
        // Telling the agent is best-effort; stranding the person who asked for
        // the wheel is not. Take control and say the notice didn't land.
        toast.warning("Couldn't tell your agent — taking control now.");
        void runClaim();
      }
    })();
  }, [agentAwaitingHuman, conversationId, dispatch, phase, runClaim, store]);

  // The agent reached its turn boundary and drained the note (the card leaves
  // the slice on `injection_consumed`) — control moves now.
  useEffect(() => {
    if (phase !== "notifying" || !pendingInjectionId) return;
    if (noteStatus === null) void runClaim();
  }, [noteStatus, pendingInjectionId, phase, runClaim]);

  // The run ended before the boundary ever came. Nothing left to wait for: the
  // note stays queued for the agent's next turn and the person gets the wheel.
  useEffect(() => {
    if (phase !== "notifying" || isExecuting) return;
    void runClaim();
  }, [isExecuting, phase, runClaim]);

  const takeOverImmediately = useCallback(() => {
    if (phase !== "notifying" || !conversationId) return;
    setPhase("claiming");
    void (async () => {
      // Stop the run first so the agent issues no further browser actions.
      await dispatch(cancelExecution(conversationId));
      // The steer note can never be delivered on a stopped run — withdraw it
      // so it cannot resurface later out of context. A 409 (already drained)
      // is fine: the agent got it, which is the outcome we wanted anyway.
      if (pendingInjectionId) {
        await dispatch(
          retractInboxItem({ conversationId, injectionId: pendingInjectionId }),
        );
      }
      // `cancelExecution` carries no reason, so the WHY rides the inbox: held
      // for the agent's next turn, exactly like any other turn_end note.
      await dispatch(
        enqueueInboxMessage({
          conversationId,
          text: TAKEOVER_INTERRUPT_NOTE,
          mode: "queue",
          kind: "system_message",
        }),
      );
      await runClaim();
    })();
  }, [conversationId, dispatch, pendingInjectionId, phase, runClaim]);

  return {
    phase,
    waiting: phase === "notifying",
    begin,
    takeOverImmediately,
  };
}
