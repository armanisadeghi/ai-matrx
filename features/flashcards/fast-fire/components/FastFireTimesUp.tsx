// features/flashcards/fast-fire/components/FastFireTimesUp.tsx
//
// The "TIME'S UP" hold (owner direction 2026-07-08). When a card's clock RUNS OUT
// — as opposed to the learner hitting "Next" — a small beep and the next card
// used to appear with no clear signal, and learners kept talking into the next
// question without noticing. This full-screen cue makes running out of time
// unmistakable: it fills the viewport for the `advancing` beat (~1s) whenever the
// last advance was a `timeout`, paired with the prominent `timesup` buzzer.
//
// It is a pure UX layer — self-gating on the slice, no props. Recording continues
// underneath (capture is continuous), so this hold never changes the audio timing;
// a deliberate skip does NOT show it (that path is alarm-free by design).
//
// React Compiler is on: no manual memo.

"use client";

import { AlarmClock } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectFastFirePhase,
  selectFastFireAdvanceReason,
} from "../redux/fastFire.selectors";

export function FastFireTimesUp() {
  const phase = useAppSelector(selectFastFirePhase);
  const reason = useAppSelector(selectFastFireAdvanceReason);

  // Only during the advancing hold, and only when the clock ran out.
  if (phase !== "advancing" || reason !== "timeout") return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-destructive text-destructive-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
    >
      <AlarmClock className="h-16 w-16 animate-pulse" strokeWidth={2.25} />
      <p className="text-5xl font-extrabold uppercase tracking-tight sm:text-6xl">
        Time&apos;s up
      </p>
      <p className="text-base font-medium text-destructive-foreground/90 sm:text-lg">
        Next card coming up…
      </p>
    </div>
  );
}
