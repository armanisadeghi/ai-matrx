// features/education/engage/components/results/ResultsSummary.tsx
//
// End-of-round summary. Headlines the OUTCOME (mastery gained, accuracy) over
// vanity (raw score is present but secondary). For multiplayer it also renders
// the finalized scoreboard — team/private only, never a public speed-shame
// screen: players are listed by score but the framing is "everyone improved",
// and each player's own mastery gain is the emphasized number.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { TrendingUp, Target, Flame, Trophy, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BADGES, type BadgeKey } from "../../engine/badges";
import type { RoomPlayerResult } from "../../data/gameService";
import type { GameOutcome } from "../../types";

export function ResultsSummary({
  outcome,
  newBadges,
  scoreboard,
  currentUserId,
  onPlayAgain,
  onExit,
}: {
  outcome: GameOutcome;
  newBadges: BadgeKey[];
  scoreboard?: RoomPlayerResult[];
  currentUserId?: string | null;
  onPlayAgain?: () => void;
  onExit?: () => void;
}) {
  const accuracy =
    outcome.answeredCount > 0
      ? Math.round((outcome.correctCount / outcome.answeredCount) * 100)
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">Round complete</h2>
        <p className="text-muted-foreground">
          Every answer counted toward your mastery.
        </p>
      </div>

      {/* Outcome-first metric grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={TrendingUp}
          label="Mastery gained"
          value={`+${outcome.masteryGain.toFixed(1)}`}
          primary
        />
        <Metric icon={Target} label="Accuracy" value={`${accuracy}%`} />
        <Metric
          icon={Flame}
          label="Best streak"
          value={String(outcome.bestStreak)}
        />
        <Metric
          icon={Trophy}
          label="Score"
          value={outcome.score.toLocaleString()}
        />
      </div>

      {newBadges.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium text-foreground">
            New badges earned
          </p>
          <div className="flex flex-wrap gap-2">
            {newBadges.map((key) => {
              const def = BADGES[key];
              const Icon = def.icon;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                  title={def.description}
                >
                  <Icon className="h-4 w-4" />
                  {def.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {scoreboard && scoreboard.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
            <Award className="h-4 w-4" /> Room results
          </div>
          <ul className="divide-y divide-border">
            {scoreboard.map((p, i) => (
              <li
                key={p.user_id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm",
                  p.user_id === currentUserId && "bg-accent/50",
                )}
              >
                <span className="w-5 text-center font-mono text-muted-foreground">
                  {i + 1}
                </span>
                <span className="flex-1 truncate font-medium text-foreground">
                  {p.display_name || "Player"}
                  {p.user_id === currentUserId && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <TrendingUp className="h-3.5 w-3.5" />+
                  {Number(p.mastery_gain).toFixed(1)}
                </span>
                <span className="w-16 text-right tabular-nums text-muted-foreground">
                  {p.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-center gap-3">
        {onPlayAgain && (
          <Button onClick={onPlayAgain}>Play again</Button>
        )}
        {onExit && (
          <Button variant="outline" onClick={onExit}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  primary,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 text-center",
        primary && "border-primary/40 bg-primary/5",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5",
          primary ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="text-lg font-bold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
