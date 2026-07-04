"use client";

// features/flashcards/fast-fire/voice-test/VoiceAnswerMicMeter.tsx
//
// Live mic feedback while the learner speaks — matches AudioDevicesPanel's level
// bar colors/thresholds so voice pickup is obvious, not a faint icon pulse.

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same scaling as AudioDevicesPanel MicLevelMeter (0–100). */
function levelPercent(normalized: number): number {
  return Math.min(100, Math.round(normalized * 140));
}

function barColor(pct: number): string {
  if (pct > 80) return "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.55)]";
  if (pct > 40) return "bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.45)]";
  if (pct > 8) return "bg-primary/90";
  return "bg-primary/40";
}

export function VoiceAnswerMicMeter({
  level,
  seconds,
}: {
  /** 0–1 from continuousCapture subscribeLevel */
  level: number;
  seconds: number;
}) {
  const pct = levelPercent(level);
  const isActive = pct > 8;
  const R = 46;
  const C = 2 * Math.PI * R;
  const scale = 1 + (pct / 100) * 0.22;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <div
        className="relative flex h-32 w-32 items-center justify-center"
        aria-live="polite"
        aria-label={
          isActive
            ? "Microphone is picking up your voice"
            : "Waiting for your voice"
        }
      >
        {isActive && (
          <>
            <span
              className="absolute inset-0 rounded-full bg-green-500/25 animate-ping"
              style={{ animationDuration: "1.2s" }}
            />
            <span
              className="absolute inset-2 rounded-full bg-green-500/15 transition-transform duration-75"
              style={{ transform: `scale(${scale})` }}
            />
          </>
        )}

        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="6"
            className="stroke-muted"
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={cn(
              "transition-[stroke] duration-150",
              isActive ? "stroke-green-500" : "stroke-primary",
            )}
            strokeDasharray={C}
            style={{
              strokeDashoffset: 0,
              animation: `voiceTestCountdown ${seconds}s linear forwards`,
            }}
          />
        </svg>

        <div
          className={cn(
            "relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full transition-all duration-75",
            isActive
              ? "bg-green-500/20 ring-2 ring-green-500/50"
              : "bg-primary/10 ring-2 ring-primary/20",
          )}
          style={{ transform: `scale(${scale})` }}
        >
          <Mic
            className={cn(
              "h-8 w-8 transition-colors duration-75",
              isActive ? "text-green-600 dark:text-green-400" : "text-primary",
            )}
          />
        </div>

        <style>{`@keyframes voiceTestCountdown { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${C} } }`}</style>
      </div>

      <div className="flex w-full items-center gap-3 px-1">
        <Mic
          className={cn(
            "h-5 w-5 shrink-0 transition-colors duration-75",
            isActive
              ? "text-green-600 dark:text-green-400"
              : "text-muted-foreground",
          )}
        />
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-75",
              barColor(pct),
            )}
            style={{ width: `${Math.max(pct, isActive ? 4 : 0)}%` }}
          />
        </div>
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>

      <p
        className={cn(
          "text-sm font-medium transition-colors duration-150",
          isActive ? "text-green-600 dark:text-green-400" : "text-primary",
        )}
      >
        {isActive ? "Listening — keep speaking" : "Speak your answer…"}
      </p>
    </div>
  );
}
