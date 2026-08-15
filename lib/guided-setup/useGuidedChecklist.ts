"use client";

/**
 * The one hook behind every guided checklist: load the run, run the checks,
 * perform what we can on the user's behalf, and persist what only a human can
 * answer.
 *
 * Behaviours that are the whole point of the primitive and must not be
 * re-implemented by a consumer:
 *
 *  - **Re-verifies on return.** Checks run on mount and again whenever the tab
 *    regains focus after a quiet period — because a step that passed can
 *    regress (a DNS record gets deleted, an access token is revoked). Coming
 *    back days later shows today's truth, not the day you left.
 *  - **Paints instantly, then corrects.** Last-known results render the moment
 *    the row loads, flagged stale, and are overwritten by the live check.
 *  - **Does it for them.** Auto steps whose live check says "not done" run
 *    without being asked (unless the definition opted out), then re-check.
 *  - **Never acts on a guess.** An auto step is never run off a stale or
 *    `unknown` result — only off a live `fail`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  autoRunnableSteps,
  checklistSteps,
  EMPTY_RUN_STATE,
  resolveChecklist,
  withAutoRun,
  withConfirmation,
  withLastResult,
  type LiveResults,
} from "./engine";
import { ChecklistRunCreateError, loadOrCreateRun, saveRunState } from "./service";
import type {
  CheckResult,
  ChecklistDefinition,
  ChecklistRun,
  ChecklistRunState,
  ChecklistScope,
  ResolvedChecklist,
} from "./types";

/** Re-check when the tab has been away at least this long. */
const REFOCUS_RECHECK_MS = 60_000;

export interface UseGuidedChecklistResult {
  resolved: ResolvedChecklist | null;
  /** True until the persisted run has loaded (checks may still be in flight). */
  loading: boolean;
  /** A problem loading or saving the checklist itself — never a step failure. */
  error: string | null;
  /** Re-run every check now. */
  recheck: () => void;
  /** Tick / untick a `confirmed` step. */
  setConfirmed: (stepId: string, confirmed: boolean) => void;
  /** Run an `auto` step's action on demand (for `autoRun: false` steps). */
  runStep: (stepId: string) => void;
  /** Run a `fix.run` attached to a failing check. */
  runFix: (stepId: string) => void;
  /** Step ids with work in flight. */
  busy: ReadonlySet<string>;
}

export function useGuidedChecklist<Ctx>(args: {
  definition: ChecklistDefinition<Ctx>;
  /** The context every check/run/how-to receives. */
  context: Ctx;
  scope: ChecklistScope | null;
  /**
   * Hold off until the caller's own data has loaded. Checking before the site
   * (or party, or mailbox) is in hand would report "not done" for everything
   * and then flip — which reads as breakage, not as loading.
   */
  ready?: boolean;
}): UseGuidedChecklistResult {
  const { definition, context } = args;
  const ready = args.ready !== false && args.scope !== null;
  const userId = useAppSelector(selectUserId);

  const [run, setRun] = useState<(ChecklistRun & { version: number }) | null>(
    null,
  );
  const [state, setState] = useState<ChecklistRunState>(EMPTY_RUN_STATE);
  const [live, setLive] = useState<LiveResults>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);

  // Latest-wins: a check that resolves after the context changed must not land.
  const generation = useRef(0);
  const runRef = useRef<(ChecklistRun & { version: number }) | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const autoRanRef = useRef<Set<string>>(new Set());
  const lastCheckAt = useRef(0);
  /**
   * Mutations raised before the run row finished loading, plus a serializing
   * tail so two saves never race each other into a version conflict.
   *
   * The queue is not a nicety — the first round of checks reliably resolves
   * BEFORE the row loads, so without it the last-known cache is never written
   * and "paints instantly on return" silently never happens. (Caught live on
   * first run: the row existed at version 1 with an empty `steps` map.)
   */
  const pendingRef = useRef<((s: ChecklistRunState) => ChecklistRunState)[]>([]);
  const writeChain = useRef<Promise<void>>(Promise.resolve());

  const scopeKey = args.scope
    ? `${args.scope.organizationId}::${args.scope.targetKey ?? ""}`
    : null;

  /**
   * The step list, which a definition may derive from the context (Stripe's
   * outstanding-requirement list is the reason that form exists). `stepsKey`
   * drives the check effect: when the world grows a step we have never
   * checked, it must be checked, and depending on the whole context object
   * would instead re-check everything on every render.
   */
  const steps = useMemo(
    () => checklistSteps(definition, context),
    [definition, context],
  );
  const stepsKey = steps.map((step) => step.id).join("|");

  // ── Load (or create) the persisted run ──────────────────────────────────
  useEffect(() => {
    if (!ready || !args.scope) return;
    let cancelled = false;
    setLoading(true);
    void loadOrCreateRun(definition.key, args.scope)
      .then((loaded) => {
        if (cancelled) return;
        runRef.current = loaded;
        setRun(loaded);
        setError(null);
        // Anything that happened while we were loading is applied ON TOP of
        // the stored state, in the order it happened — never discarded, and
        // never used to overwrite a teammate's row wholesale.
        const held = pendingRef.current;
        pendingRef.current = [];
        setState(held.reduce((acc, mutate) => mutate(acc), loaded.state));
        for (const mutate of held) enqueueSave(mutate);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // A checklist that cannot persist still WORKS — every check is live.
        // Degrading to in-memory beats hiding the user's setup steps.
        if (cause instanceof ChecklistRunCreateError) {
          console.error("[guided-setup] could not create the saved checklist", cause);
          setError(
            "We couldn't start saving your progress, so anything you tick here won't be remembered yet.",
          );
        } else {
          console.error("[guided-setup] could not load the saved checklist", cause);
          setError(
            "We couldn't load your saved progress, so anything you tick here won't be remembered yet.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [definition.key, scopeKey, ready]);

  /** Save one mutation, queued behind whatever is already in flight. */
  const enqueueSave = useCallback(
    (mutate: (prev: ChecklistRunState) => ChecklistRunState) => {
      writeChain.current = writeChain.current
        .then(async () => {
          const current = runRef.current;
          if (!current) return;
          const saved = await saveRunState(current, mutate);
          runRef.current = saved;
          setRun(saved);
          setState(saved.state);
        })
        .catch((cause: unknown) => {
          console.error("[guided-setup] could not save your progress", cause);
          setError(
            "We couldn't save that just now. Your progress on this screen is fine — try again in a moment.",
          );
        });
    },
    [],
  );

  /**
   * Apply a state mutation locally and persist it. Before the run row has
   * loaded the mutation is HELD, not dropped — the load effect flushes the
   * queue the moment the row is in hand.
   */
  const persist = useCallback(
    (mutate: (prev: ChecklistRunState) => ChecklistRunState) => {
      setState((prev) => mutate(prev));
      if (!runRef.current) {
        pendingRef.current.push(mutate);
        return;
      }
      enqueueSave(mutate);
    },
    [enqueueSave],
  );

  // ── Run every check ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const gen = ++generation.current;
    lastCheckAt.current = Date.now();

    const checkable = checklistSteps(definition, contextRef.current).filter(
      (step) => step.kind === "auto" || step.kind === "verified",
    );
    setLive((prev) => {
      const next = { ...prev };
      for (const step of checkable) next[step.id] = { status: "checking" };
      return next;
    });

    for (const step of checkable) {
      // No `confirmed` guard here: `checkable` is already filtered to
      // auto/verified above, so the old re-check was unreachable and TS now
      // rejects the comparison outright.
      void step
        .check(contextRef.current)
        .catch(
          (cause: unknown): CheckResult => ({
            status: "unknown",
            reason: "We couldn't check this one just now.",
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
        )
        .then((result) => {
          if (gen !== generation.current) return;
          setLive((prev) => ({ ...prev, [step.id]: result }));
          // Cache it so the next visit paints before the check lands — but
          // only when the verdict actually CHANGED. Re-stamping an identical
          // result on every visit is a write per step per page view, and it
          // would also destroy the one thing the timestamp is for: saying how
          // long this step has been in the state it is in.
          if (result.status === "pass" || result.status === "fail") {
            const stored = runRef.current?.state.steps[step.id]?.lastResult;
            if (
              stored?.status !== result.status ||
              stored?.reason !== result.reason
            ) {
              persist((prev) =>
                withLastResult(prev, step.id, result, new Date().toISOString()),
              );
            }
          }
        });
    }
  }, [definition.key, scopeKey, ready, checkNonce, stepsKey]);

  const recheck = useCallback(() => setCheckNonce((n) => n + 1), []);

  // ── Re-verify when the user comes back ──────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckAt.current < REFOCUS_RECHECK_MS) return;
      recheck();
    };
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, recheck]);

  const resolved = useMemo(
    () =>
      ready
        ? resolveChecklist({ definition, ctx: context, state, live, busy })
        : null,
    [definition, context, state, live, busy, ready],
  );

  const withBusy = useCallback(
    async (stepId: string, work: () => Promise<void>) => {
      setBusy((prev) => new Set(prev).add(stepId));
      try {
        await work();
      } catch (cause: unknown) {
        console.error(`[guided-setup] step "${stepId}" failed`, cause);
        setLive((prev) => ({
          ...prev,
          [stepId]: {
            status: "unknown",
            reason: "That didn't go through. Try it again in a moment.",
            detail: cause instanceof Error ? cause.message : String(cause),
          },
        }));
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(stepId);
          return next;
        });
        recheck();
      }
    },
    [recheck],
  );

  const runStep = useCallback(
    (stepId: string) => {
      const step = checklistSteps(definition, contextRef.current).find(
        (s) => s.id === stepId,
      );
      if (!step || step.kind !== "auto") return;
      void withBusy(stepId, async () => {
        await step.run(contextRef.current);
        autoRanRef.current.add(stepId);
        persist((prev) => withAutoRun(prev, stepId, new Date().toISOString()));
      });
    },
    [definition, persist, withBusy],
  );

  const runFix = useCallback(
    (stepId: string) => {
      const fix = live[stepId]?.fix;
      const step = checklistSteps(definition, contextRef.current).find(
        (s) => s.id === stepId,
      );
      const declared = step?.kind === "verified" ? step.fix : undefined;
      const action = fix?.run ?? declared?.run;
      if (!action) return;
      void withBusy(stepId, action);
    },
    [definition, live, withBusy],
  );

  // ── Do it for them ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!resolved) return;
    const ids = autoRunnableSteps({
      definition,
      ctx: contextRef.current,
      resolved,
      live,
      busy,
      alreadyRan: autoRanRef.current,
    });
    for (const id of ids) runStep(id);
  }, [resolved, definition, live, busy, runStep]);

  const setConfirmed = useCallback(
    (stepId: string, confirmed: boolean) => {
      persist((prev) =>
        withConfirmation(
          prev,
          stepId,
          confirmed,
          userId,
          new Date().toISOString(),
        ),
      );
    },
    [persist, userId],
  );

  // ── Stamp completion (a milestone, not a status) ─────────────────────────
  // The verdict itself is always derived live; `completed_at` only records the
  // first moment it was true, so a consumer can say "set up on 3 March" and an
  // assist can stop nagging. It is never read back as the answer.
  useEffect(() => {
    if (!resolved?.complete || !run || run.completedAt) return;
    void saveRunState(run, (s) => s, {
      completedAt: new Date().toISOString(),
    })
      .then((saved) => {
        runRef.current = saved;
        setRun(saved);
      })
      .catch(() => undefined);
  }, [resolved?.complete, run]);

  return {
    resolved,
    loading,
    error,
    recheck,
    setConfirmed,
    runStep,
    runFix,
    busy,
  };
}
