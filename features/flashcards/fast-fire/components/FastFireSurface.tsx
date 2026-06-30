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

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openSetup, resetFastFire } from "../redux/fastFireSlice";
import { selectFastFirePhase, selectFastFireConfig } from "../redux/fastFire.selectors";
import { useFastFireDrill } from "../hooks/useFastFireDrill";
import { FastFireSetup } from "./FastFireSetup";
import { FastFireCountdown } from "./FastFireCountdown";
import { FastFireLiveCard } from "./FastFireLiveCard";
import { FastFireScoreboard } from "./FastFireScoreboard";

const FLASHCARDS_HOME = "/education/flashcards";

export function FastFireSurface({ setId }: { setId?: string | null }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const phase = useAppSelector(selectFastFirePhase);
  const config = useAppSelector(selectFastFireConfig);

  // The drill orchestrator — mounted for the whole surface so capture + timers
  // persist across phase transitions. It self-guards on phase internally.
  const { subscribeProgress, countdown, skipCard, abort } = useFastFireDrill();

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

  switch (phase) {
    case "idle":
      return (
        <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    case "setup":
      return <FastFireSetup />;
    case "countdown":
      return <FastFireCountdown count={countdown} />;
    case "card_recording":
    case "advancing":
      return (
        <FastFireLiveCard
          subscribeProgress={subscribeProgress}
          onSkip={skipCard}
          onAbort={abort}
        />
      );
    case "finalizing":
    case "complete":
      return <FastFireScoreboard onRestart={restart} onExit={exit} />;
    case "abandoned":
      return (
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
    default:
      return null;
  }
}
