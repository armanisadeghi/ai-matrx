// features/hr/entry-points/HrTasksDoor.tsx
//
// D8 / SPEC-UI-IA §6 — HR's badge on `/tasks`, and the door it opens.
//
// 🚨 HR DOES NOT BUILD A SECOND TASK STORE, AND THIS COMPONENT IS WHERE THAT
// RULE IS KEPT HONEST. An "HR task" is an `hr.wf_instance` — an approval, an
// acknowledgment, a decision on a workflow step. It is NOT a `projects.tasks`
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

import { Button } from "@ai-matrx/design-system/controls";
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
    inbox.pagination.needs_my_decision.total +
    inbox.pagination.failures_assigned_to_me.total;

  if (waiting === 0) return null;

  // THE ONE CONTROL: the 28px button skin on the link, the waiting count as its corner badge
  // (a hand-built 44px pill stood taller than every header control beside it at 375).
  return (
    <Button asChild icon={<Users />} badge={waiting} aria-label={`HR, ${waiting} waiting`}>
      <Link href={hrTasksHref(orgRef)}>HR</Link>
    </Button>
  );
}
