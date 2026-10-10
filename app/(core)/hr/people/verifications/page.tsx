// Route 17 — `/hr/people/verifications` (SPEC-UI-IA §3.2, SPEC-EMPLOYEES §4.9).
//
// 🚨 A LETTER IS AN ASSERTION THIS ORGANIZATION IS HELD TO. Generation freezes
// the assertion into `snapshot`; a delivered letter is never edited, only
// superseded by a new request.

import { hrHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { VerificationsSurface } from "@/features/hr/people/verifications/components/VerificationsSurface";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Verification letters" };

export default async function HrVerificationsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  return (
    <>
      <RecordPageHeader
        backHref={hrHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
        ]}
        record={{ name: "Verification letters" }}
      />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<HrLoading variant="table" />}>
            <VerificationsSurface />
          </Suspense>
        </div>
      </div>
    </>
  );
}
