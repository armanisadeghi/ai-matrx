// features/hr/entry-points/HrTasksDoor.tsx
//
// D8 / SPEC-UI-IA §6 — HR's badge on `/tasks`, and the door it opens.
//
// 🚨 HR DOES NOT BUILD A SECOND TASK STORE, AND THIS COMPONENT IS WHERE THAT
// RULE IS KEPT HONEST. An "HR task" is an `hr.wf_instance` — an approval, an
// acknowledgment, a decision on a workflow step. It is NOT a `workspace.tasks`
// row and it must never be copied into one: the moment it is, there are two
// places a pay-change approval can be decided and two answers about whether it
// was.
//
// So the badge does not inject rows into the general list. It reports how many
// HR decisions are waiting on this person and DOORS to `/hr/tasks` — which is
// lane L10's surface and already exists. Never rebuild it here.
//
// 🚨 ABSENT WHEN THERE IS NOTHING TO SAY. No HR standing, HR off for this org,
// or an empty inbox → this renders nothing at all. A permanent "HR (0)" chip on
// everyone's task list is noise for the many to serve the few.

"use client";

import Link from "next/link";
import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { hrTasksHref } from "@/features/hr/routes";
import { useHrInbox } from "@/features/hr/tasks/hooks/useHrInbox";
import { useHrContext } from "@/features/hr/shared/useHrContext";

export function HrTasksDoor() {
  const { orgRef } = useHrContext();
  // "mine" — this is a badge about what is waiting on the VIEWER, not a queue
  // summary. A queue count on a personal task list is somebody else's work.
  const { inbox, refusal, loading } = useHrInbox("mine", null);

  if (loading || refusal || !inbox) return null;

  const waiting =
    (inbox.needs_my_decision?.length ?? 0) +
    (inbox.failures_assigned_to_me?.length ?? 0);

  if (waiting === 0) return null;

  return (
    <Link
      href={hrTasksHref(orgRef)}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted sm:min-h-8"
    >
      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span>HR</span>
      <Badge variant="secondary" className="h-5 px-1.5 text-[0.6875rem]">
        {waiting}
      </Badge>
    </Link>
  );
}
