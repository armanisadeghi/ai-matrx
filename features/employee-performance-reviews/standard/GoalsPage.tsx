"use client";

// /hr/performance/goals — my goals and my team's. A goal can be aligned under any goal on this page.

import { useCallback, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { EmptyState } from "@ai-matrx/design-system/controls";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";

import { GoalsView } from "./GoalsView";
import type { Goal, TeamMember } from "./goals";
import { useReloadOnReviewsChanged } from "./invalidation";
import { listTeamGoals } from "./service";

export function GoalsPage() {
  const hr = useHrContext();
  const me = hr.active?.employment_id ?? null;
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [mine, setMine] = useState<Goal[]>([]);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useReloadOnReviewsChanged(useCallback(() => setTick((t) => t + 1), []));

  useEffect(() => {
    if (!me) return;
    let live = true;
    void listTeamGoals(me).then((r) => {
      if (!live) return;
      if (r.ok) setTeam(r.data);
      else setTeamError(r.message);
    });
    return () => {
      live = false;
    };
  }, [me, tick]);

  const teamGoals = team.flatMap((m) => m.goals);
  const alignable = [...mine, ...teamGoals];

  return (
    <HrPageState operation="Goals" employerScope="one" variant="panel">
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-3 mt-3 space-y-6">
          {me ? (
            <GoalsView employmentId={me} title="My goals" alignable={teamGoals} onLoaded={setMine} reloadKey={tick} />
          ) : (
            <EmptyState icon={<Target />} title="You have no active employment here" line="Goals belong to an employee" />
          )}
          {teamError ? (
            <p role="alert" className="text-sm text-destructive">
              {teamError}
            </p>
          ) : null}
          {team.map((m) => (
            <GoalsView key={m.employmentId} employmentId={m.employmentId} title={`${m.name}'s goals`} alignable={alignable} reloadKey={tick} />
          ))}
        </div>
      </div>
    </HrPageState>
  );
}
