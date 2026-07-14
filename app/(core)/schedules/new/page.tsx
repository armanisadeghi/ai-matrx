// app/(core)/schedules/new/page.tsx

"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

export default function NewSchedulePage() {
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
          <ScheduleForm />
        </div>
      </div>
    </>
  );
}
