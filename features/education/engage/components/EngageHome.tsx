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
import { Users, LogIn, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationGameScope } from "@/features/surfaces/manifests/education-game.manifest";
import { ENGAGE_ROUTES } from "../constants";
import { StreakCard } from "./streak/StreakCard";
import { LeaguePanel } from "./league/LeaguePanel";
import { BadgeShelf } from "./badges/BadgeShelf";

const SURFACE_NAME = "matrx-user/education-game";

export function EngageHome() {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const go = (href: string) => startNav(() => router.push(href));

  const buildScope = () => createEducationGameScope({ view: "home" });

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
    <EducationToolHeader title="Study Games" />
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto px-4 pb-4">
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
    </SurfaceRuntimeProvider>
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
