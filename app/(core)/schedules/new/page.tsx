// app/(core)/schedules/new/page.tsx

"use client";

import { useSearchParams } from "next/navigation";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

export default function NewSchedulePage() {
  // Prefill from a composer handoff (e.g. AI Work's "Schedule this" link):
  // `?agentId=<uuid>&prompt=<text>`. An unknown/blank agentId just leaves the
  // agent picker empty — the form works exactly as it does with no params.
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId");
  const prompt = searchParams.get("prompt");

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/schedules"
              ariaLabel="Back to schedules"
            />
            <h1 className="ml-2 text-sm font-medium text-foreground truncate">
              New schedule
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-6 pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="max-w-3xl mx-auto">
          <ScheduleForm
            initialAgentId={agentId || null}
            initialPrompt={prompt || undefined}
          />
        </div>
      </div>
    </>
  );
}
