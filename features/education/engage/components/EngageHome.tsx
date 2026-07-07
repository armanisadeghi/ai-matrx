// features/education/engage/components/EngageHome.tsx
//
// The Study Games home (list-first "savior" view for /education/game, NOT a
// forced detail page). Primary actions (Solo / Host / Join) up top, then the
// healthy-engagement surfaces: streak (with forgiveness), weekly league, and
// the badge shelf. Play IS review — every entry point feeds the study spine.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, Users, LogIn, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENGAGE_ROUTES } from "../constants";
import { StreakCard } from "./streak/StreakCard";
import { LeaguePanel } from "./league/LeaguePanel";
import { BadgeShelf } from "./badges/BadgeShelf";

export function EngageHome() {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const go = (href: string) => startNav(() => router.push(href));

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto p-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Gamepad2 className="h-5 w-5 text-primary" /> Study Games
        </h1>
        <p className="text-sm text-muted-foreground">
          Play is review. Every question is scheduled by the spaced-repetition
          engine, so having fun moves your mastery — no speed-shame, ever.
        </p>
      </header>

      {/* Primary actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard
          icon={Zap}
          title="Solo Arcade"
          desc="Race your own due queue"
          onClick={() => go(ENGAGE_ROUTES.solo)}
          busy={navigating}
          primary
        />
        <ActionCard
          icon={Users}
          title="Host a game"
          desc="Create a room, share the code"
          onClick={() => go(ENGAGE_ROUTES.host)}
          busy={navigating}
        />
        <ActionCard
          icon={LogIn}
          title="Join a game"
          desc="Enter a host's code"
          onClick={() => go(ENGAGE_ROUTES.join)}
          busy={navigating}
        />
      </div>

      <StreakCard />

      <div className="grid gap-4 md:grid-cols-2">
        <LeaguePanel />
        <BadgeShelf />
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  desc,
  onClick,
  busy,
  primary,
}: {
  icon: typeof Zap;
  title: string;
  desc: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
        primary
          ? "border-primary bg-primary/5 hover:bg-primary/10"
          : "border-border bg-card hover:border-primary/50",
        busy && "opacity-60",
      )}
    >
      <Icon className={cn("h-6 w-6", primary ? "text-primary" : "text-foreground")} />
      <span className="font-semibold text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </button>
  );
}
