// features/flashcards/fast-fire/components/FastFireCountdown.tsx
//
// The "Get Ready!" 3·2·1 countdown overlay (REQUIREMENTS §2.2). The number comes
// from the drill hook (a plain interval that lands on `beginRecording`), so the
// overlay is purely presentational.

"use client";

import { Flame } from "lucide-react";

export function FastFireCountdown({ count }: { count: number | null }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 bg-textured">
      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
        <Flame className="h-6 w-6" />
        <span className="text-lg font-semibold">Get ready!</span>
      </div>
      <div
        key={count}
        className="flex h-32 w-32 items-center justify-center rounded-full bg-orange-500/10 text-6xl font-bold tabular-nums text-orange-600 motion-safe:animate-in motion-safe:zoom-in-50 dark:text-orange-400"
      >
        {count ?? ""}
      </div>
      <p className="text-sm text-muted-foreground">
        Speak each answer aloud. Cards advance automatically.
      </p>
    </div>
  );
}
