"use client";

// features/hr/time/HrTimeShell.tsx
//
// The Time & Attendance section's route-tab bar — `HrSubShell` for UI-IA routes
// 28–34. A copy of `features/hr/leave/manager/LeaveDeskShell.tsx`, which is
// already the right pattern.
//
// 🚨 THIS SHELL CLOSES FOUR ORPHANED SURFACES. Every `/hr/time/*` page mounted a
// bare `PageHeader`, so the section rendered NO HR nav strip and NO employer
// switcher — and, because the top-level "Time" nav item redirects to
// `/hr/time/timesheets`, the register at `/hr/time/punches`, the exception queue
// at `/exceptions`, the overtime queue at `/overtime` and the shared clock at
// `/clock` were reachable ONLY by typing the URL. Four built, working, shipped
// surfaces that a user could not get to. Contrast `/hr/leave`, which has had this
// bar since it shipped.
//
// 🚨 AND THE EMPLOYER SWITCHER MATTERED MOST HERE. HR is strictly
// single-employer, and `HrShell`'s switcher is how a person changes which one
// they are looking at. Its absence on the section that holds timesheets, punches
// and pay periods meant somebody who arrived from another employer's context had
// no visible control to correct it — on exactly the data where merging two
// employers is a compliance defect rather than a cosmetic one.
//
// EVERY TAB BELOW IS A ROUTE THAT EXISTS TODAY. This bar advertises nothing
// unbuilt: `/hr/time/timesheets`, `/punches`, `/exceptions`, `/overtime`,
// `/periods` and `/clock` all have a `page.tsx` at HEAD. A tab for a surface the
// lane has not shipped would be the same defect as the nine dead pillar items
// this session fixed, one level down.

import type { ReactNode } from "react";
import {
  AlarmClock,
  CalendarRange,
  FileClock,
  Fingerprint,
  Timer,
  TriangleAlert,
} from "lucide-react";

import { HrSubShell, type HrRouteTab } from "@/features/hr/shared/HrSubShell";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import {
  hrOvertimeHref,
  hrPunchesHref,
  hrTimeClockHref,
  hrTimeExceptionsHref,
  hrTimePeriodsHref,
  hrTimesheetsHref,
} from "@/features/hr/routes";

export function HrTimeShell({
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
      key: "timesheets",
      label: "Timesheets",
      href: hrTimesheetsHref(orgRef),
      icon: FileClock,
    },
    {
      key: "exceptions",
      label: "Exceptions",
      href: hrTimeExceptionsHref(orgRef),
      icon: TriangleAlert,
    },
    {
      key: "overtime",
      label: "Overtime",
      href: hrOvertimeHref(orgRef),
      icon: Timer,
    },
    {
      key: "periods",
      label: "Pay periods",
      href: hrTimePeriodsHref(orgRef),
      icon: CalendarRange,
    },
    {
      /*
        The RAW punch register — AD-11's evidence lane. It sits beside the
        timesheet rather than inside it precisely because no computed or rounded
        figure appears on it, and that separation is only legible if a person can
        see both tabs at once.
      */
      key: "punches",
      label: "Punches",
      href: hrPunchesHref(orgRef),
      icon: Fingerprint,
    },
    {
      key: "clock",
      label: "Shared clock",
      href: hrTimeClockHref(orgRef),
      icon: AlarmClock,
    },
  ];

  return (
    <HrSubShell
      tabs={tabs}
      title={title}
      description={description}
      actions={actions}
    >
      {children}
    </HrSubShell>
  );
}
