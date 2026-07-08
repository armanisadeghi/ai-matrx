// features/education/engage/components/league/LeaguePanel.tsx
//
// The opt-in weekly league — scored by MASTERY GAIN (the outcome), not hours or
// raw wins. Fully opt-in (off by default), so no one is dragged into
// competition. When opted out, we show only the value prop + a toggle; no
// leaderboard pressure.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { Trophy, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLeague } from "../../data/useEngageMeta";
import { useCurrentPlayer } from "../../data/useCurrentPlayer";

export function LeaguePanel() {
  const { displayName } = useCurrentPlayer();
  const { leaderboard, loading, optedIn, setOptIn } = useLeague();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Trophy className="h-4 w-4 text-amber-500" /> Weekly League
        </p>
        <Button
          size="sm"
          variant={optedIn ? "outline" : "default"}
          onClick={() => void setOptIn(!optedIn, displayName)}
        >
          {optedIn ? "Leave" : "Join"}
        </Button>
      </div>

      {!optedIn ? (
        <p className="text-sm text-muted-foreground">
          Opt in to a friendly weekly league ranked by{" "}
          <span className="text-foreground">mastery gained</span> — how much you
          actually learned, not how many hours you logged. Off by default; leave
          anytime.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading standings…</p>
      ) : leaderboard.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" /> You’re in. Play a game to put mastery on
          the board.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {leaderboard.map((entry, i) => (
            <li
              key={entry.user_id}
              className={cn(
                "flex items-center gap-3 py-2 text-sm",
                entry.is_me && "font-medium",
              )}
            >
              <span className="w-5 text-center font-mono text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-foreground">
                {entry.display_name || "Player"}
                {entry.is_me && (
                  <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1 text-primary">
                <TrendingUp className="h-3.5 w-3.5" />+
                {Number(entry.mastery_gain).toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
