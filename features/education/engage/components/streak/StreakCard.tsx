// features/education/engage/components/streak/StreakCard.tsx
//
// The HEALTHY streak surface (anti-Duolingo). Shows the current streak, banked
// freezes, and planned rest days — framing forgiveness as a feature, never
// guilt. Missing a day doesn't shame you; freezes + rest days quietly protect
// the streak, and a broken streak restarts guilt-free. Rest-day edits go
// through the SECURITY DEFINER set_streak_rest_weekdays RPC.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { Flame, Shield, Snowflake, CalendarDays, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStreak } from "../../data/useEngageMeta";
import { WEEKDAY_LABELS } from "../../constants";

export function StreakCard() {
  const { streak, loading, setRestWeekdays } = useStreak();

  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const freezes = streak?.freezes_available ?? 0;
  const rest = new Set<number>(
    (streak?.rest_weekdays as number[] | null) ?? [],
  );

  const toggleRest = (day: number): void => {
    const next = new Set(rest);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    void setRestWeekdays([...next].sort((a, b) => a - b));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/15">
            <Flame className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {loading ? "—" : current}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                day streak
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Longest: {longest} · protected by forgiveness
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm">
          <Snowflake className="h-4 w-4 text-sky-500" />
          <span className="font-medium text-foreground">{freezes}</span>
          <span className="text-muted-foreground">freezes</span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Miss a day and a <strong>freeze</strong> auto-covers it (you earn one
          every 7 days). Mark <strong>rest days</strong> below and they never
          break your streak. If it does break, you restart with a clean slate —
          no guilt.
        </p>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> Planned rest days
        </p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((label, day) => {
            const on = rest.has(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleRest(day)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
