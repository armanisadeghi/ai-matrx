// Route 3 — `/hr/me/pay` · My compensation (SPEC-EMPLOYEES §2.1).
//
// 🚨 SELF ONLY, AND THIS ROUTE ACCEPTS NO `employeeId`. Somebody else's pay is
// read at route 14's Compensation tab, which is audited.

import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MyPaySurface } from "@/features/hr/me/MyPaySurface";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "My pay" };

export default function HrMyPayPage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">My pay</h1>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<HrLoading variant="cards" />}>
            <MyPaySurface />
          </Suspense>
        </div>
      </div>
    </>
  );
}
