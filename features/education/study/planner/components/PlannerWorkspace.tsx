"use client";

// features/education/study/planner/components/PlannerWorkspace.tsx
//
// The /education/planner surface. Two views behind one shell: the AI day-by-day
// PLAN (default) and the GOALS list (the existing StudyPlanner, embedded). The
// AI plan is the headline; goals are the exam targets that seed it.
//
// React Compiler is on: no manual memo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudyPlanner } from "../../components/StudyPlanner";
import { StudyPlanView } from "./StudyPlanView";

type Tab = "plan" | "goals";

export function PlannerWorkspace({ backHref }: { backHref?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("plan");

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <div className="mb-5 inline-flex rounded-lg border border-border bg-card p-0.5">
          <TabButton
            active={tab === "plan"}
            onClick={() => setTab("plan")}
            icon={CalendarClock}
            label="Plan"
          />
          <TabButton
            active={tab === "goals"}
            onClick={() => setTab("goals")}
            icon={Target}
            label="Goals"
          />
        </div>

        {tab === "plan" ? (
          <StudyPlanView />
        ) : (
          <StudyPlanner embedded />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Target;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
