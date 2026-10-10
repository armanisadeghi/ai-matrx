// Route 2 — `/hr/me` · My Info (SPEC-UI-IA §3.1, SPEC-EMPLOYEES §2.1).
//
// 🚨 THE SAME `EmployeeProfile` COMPONENT AS ROUTES 13/14, with `viewer=self`
// resolved server-side from the caller's own employee id. There is no separate
// "my profile" implementation.

import { hrHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { MyInfoSurface } from "@/features/hr/me/MyInfoSurface";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "My info" };

export default async function HrMePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; tab?: string }>;
}) {
  const org = (await searchParams).org;
  const { tab } = await searchParams;

  return (
    <>
      <RecordPageHeader
        backHref={hrHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
        ]}
        record={{ name: "My info" }}
      />
      <div className="flex h-full flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<HrLoading variant="profile" />}>
            <MyInfoSurface tab={tab?.trim() || "personal"} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
