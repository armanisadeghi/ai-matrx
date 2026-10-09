"use client";

// features/hr/time/timesheet/PeriodApprovalGridWithDrill.tsx — /hr/time/timesheets with its numbers one
// control away (lane DRILL-WAVE3): the approval grid of ONE pay period (approving, bulk approve, raw
// punches) stays the first screen; the declared definition `hr_timesheets` counts every timesheet the
// member can see — by pay period, state, approver and approval week.

import { OrganizationDrillExplorer } from "@/components/official/drill-explorer/OrganizationDrillExplorer";

import { PeriodApprovalGrid } from "./PeriodApprovalGrid";

export function PeriodApprovalGridWithDrill({ payPeriodId }: { payPeriodId: string | null }) {
  return (
    <OrganizationDrillExplorer
      definition="hr_timesheets"
      title="Timesheets"
      rootLabel="All timesheets"
      listLabel="Approval grid"
      list={<PeriodApprovalGrid payPeriodId={payPeriodId} />}
      headline={{ measure: "timesheets", also: ["approved", "disputed", "hours"] }}
      rowNoun="timesheet"
      countMeasure="timesheets"
      location="HR › Time › Timesheets"
      dataAttribute="data-hr-timesheets-drill"
    />
  );
}
