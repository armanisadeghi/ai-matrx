// features/flashcards/fast-fire/components/FastFireSurface.tsx
//
// The FastFire surface — a thin PHASE ROUTER over the ONE state machine. It owns
// the drill orchestrator hook (countdown timer, deadline timer, capture, grading)
// and renders the right screen per phase. The slice is the single source of truth;
// this component never decides flow, it only reflects `phase`.
//
//   setup → FastFireSetup  ·  countdown → FastFireCountdown
//   card_recording/advancing → FastFireLiveCard
//   finalizing/complete → FastFireScoreboard (grades catch up live here)
//
// React Compiler is on: no manual memo.

"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildFastFireSurfaceScope } from "../fastfire-surface-scope";
import { openSetup, resetFastFire } from "../redux/fastFireSlice";
import { selectFastFirePhase, selectFastFireConfig } from "../redux/fastFire.selectors";
import { useFastFireDrill } from "../hooks/useFastFireDrill";
import { FastFireSetup } from "./FastFireSetup";
import { FastFireCountdown } from "./FastFireCountdown";
import { FastFireLiveCard } from "./FastFireLiveCard";
import { FastFireScoreboard } from "./FastFireScoreboard";
import { FastFireTimesUp } from "./FastFireTimesUp";

const FLASHCARDS_HOME = "/education/flashcards";

export function FastFireSurface({ setId }: { setId?: string | null }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();
  const phase = useAppSelector(selectFastFirePhase);
  const config = useAppSelector(selectFastFireConfig);

  // The drill orchestrator — mounted for the whole surface so capture + timers
  // persist across phase transitions. It self-guards on phase internally.
  const { subscribeProgress, countdown, skipCard, abort, onSpokenFrontEnded } =
    useFastFireDrill();

  // Enter setup on first mount (carrying a route-provided setId). Reset on leave.
  useEffect(() => {
    if (phase === "idle") {
      dispatch(openSetup({ setId: setId ?? null }));
    }
    return () => {
      dispatch(resetFastFire());
    };
    // Mount-once: setId is read at entry; changing routes remounts the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = (): void => {
    dispatch(openSetup({ setId: config.setId }));
  };

  const exit = (): void => {
    dispatch(resetFastFire());
    router.push(FLASHCARDS_HOME);
  };

  // Live scope for the surface system — read from the store at Run time only.
  const getScope = () => buildFastFireSurfaceScope(store.getState());

  let body: ReactNode;
  switch (phase) {
    case "idle":
      body = (
        <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
      break;
    case "setup":
      body = <FastFireSetup />;
      break;
    case "countdown":
      body = <FastFireCountdown count={countdown} />;
      break;
    case "card_recording":
    case "advancing":
      body = (
        <>
          <FastFireLiveCard
            subscribeProgress={subscribeProgress}
            onSkip={skipCard}
            onAbort={abort}
            onSpokenFrontEnded={onSpokenFrontEnded}
          />
          {/* Full-screen "TIME'S UP" cue — self-gates to a timed-out advance. */}
          <FastFireTimesUp />
        </>
      );
      break;
    case "finalizing":
    case "complete":
      body = <FastFireScoreboard onRestart={restart} onExit={exit} />;
      break;
    case "abandoned":
      body = (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 bg-textured text-center">
          <p className="text-sm text-muted-foreground">Session ended.</p>
          <button
            type="button"
            onClick={restart}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Start a new FastFire
          </button>
        </div>
      );
      break;
    default:
      body = null;
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-fastfire"
      getScope={getScope}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}
