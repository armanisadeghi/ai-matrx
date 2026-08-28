"use client";

// features/hr/leave/manager/LeaveDeskShell.tsx
//
// The Time Off section's route-tab bar — `HrSubShell` for UI-IA routes 42, 43 and 44.
// A copy of `features/hr/people/HrPeopleShell.tsx`, which is already the right pattern.
//
// 🚨 THIS SHELL CLOSES A LIVE DEAD END. `features/hr/shared/hr-nav.ts` has rendered a
// top-level "Time Off" item pointing at `/hr/leave` since the nav landed, and that route did
// not exist — the item 404'd for every persona that could see it. The three tabs below are the
// section it should have opened onto.
//
// 🚨 AND `/hr/leave/cases` IS NOT ONE OF THEM. The leave-of-absence case routes belong to
// another lane and are governed by §9.6's disclosure rule: a manager may know an absence
// exists and must never know why. A "Cases" tab in a bar a manager sees would disclose that
// the case system exists to somebody who holds no `medical.read` — absence, not disablement.
// When that lane ships, its tab is gated on the case capability, not added here unconditionally.

import type { ReactNode } from "react";
import { CalendarDays, Scale, Wallet } from "lucide-react";

import { HrSubShell, type HrRouteTab } from "@/features/hr/shared/HrSubShell";
import { useHrContext } from "@/features/hr/shared/useHrContext";

import { leaveBalancesHref, leaveCalendarHref, leaveQueueHref } from "./routes";

export function LeaveDeskShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { orgRef } = useHrContext();

  const tabs: HrRouteTab[] = [
    {
      key: "decide",
      label: "To decide",
      href: leaveQueueHref(orgRef),
      icon: Scale,
    },
    {
      key: "balances",
      label: "Balances",
      href: leaveBalancesHref(orgRef),
      icon: Wallet,
    },
    {
      key: "calendar",
      label: "Who's out",
      href: leaveCalendarHref(orgRef),
      icon: CalendarDays,
    },
  ];

  return (
    <HrSubShell tabs={tabs} title={title} description={description} actions={actions}>
      {children}
    </HrSubShell>
  );
}
