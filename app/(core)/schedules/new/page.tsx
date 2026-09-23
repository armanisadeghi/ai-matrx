// app/(core)/schedules/new/page.tsx

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

// useSearchParams must sit under a Suspense boundary (repo precedent:
// education/practice-tests/new, crm/chasebox) or the route degrades to a
// full-CSR bailout / build-time Suspense error.
function NewScheduleContent() {
  // Prefill from a composer handoff (e.g. AI Work's "Schedule this" link):
  // `?agentId=<uuid>&prompt=<text>`. An unknown/blank agentId just leaves the
  // agent picker empty — the form works exactly as it does with no params.
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId");
  const prompt = searchParams.get("prompt");
  // A data table's "when a row changes, run…" door: `?trigger=event&tableId=<uuid>`.
  const trigger = searchParams.get("trigger");
  const tableId = searchParams.get("tableId");
  // A record-store table's changes are `custom_record:<table id>` events (GRIDPRIM G8); the
  // grid sends that word only when the store said such a schedule can fire.
  const entityType = searchParams.get("entityType");
  const initialTrigger =
    trigger === "event"
      ? {
          type: "event" as const,
          entity_type:
            entityType && tableId && entityType === `custom_record:${tableId}` ? entityType : "user_table_row",
          ...(tableId ? { table_id: tableId } : {}),
        }
      : null;

  return (
    <ScheduleForm
      initialAgentId={agentId || null}
      initialPrompt={prompt || undefined}
      initialTrigger={initialTrigger}
    />
  );
}

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
      <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-20 sm:pb-16 pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="max-w-3xl mx-auto">
          <Suspense fallback={null}>
            <NewScheduleContent />
          </Suspense>
        </div>
      </div>
    </>
  );
}
