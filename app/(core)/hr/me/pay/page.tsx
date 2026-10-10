// Route 3 — `/hr/me/pay` · My compensation (SPEC-EMPLOYEES §2.1).
//
// 🚨 SELF ONLY, AND THIS ROUTE ACCEPTS NO `employeeId`. Somebody else's pay is
// read at route 14's Compensation tab, which is audited.

import { hrHref, hrMeHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { MyPaySurface } from "@/features/hr/me/MyPaySurface";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "My pay" };

export default async function HrMyPayPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  return (
    <>
      <RecordPageHeader
        backHref={hrMeHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
          { label: "My info", href: hrMeHref(org) },
        ]}
        record={{ name: "My pay" }}
      />
      <div className="flex h-full flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<HrLoading variant="cards" />}>
            <MyPaySurface />
          </Suspense>
        </div>
      </div>
    </>
  );
}
