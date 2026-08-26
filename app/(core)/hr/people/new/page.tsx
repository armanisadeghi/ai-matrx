// Route 12 — `/hr/people/new` · create an employee (SPEC-UI-IA §3.2 row 12,
// SPEC-EMPLOYEES §2.2 route 12 / §4.1).
//
// The prefill params are the doors other surfaces use to send somebody here
// without making the user retype what the sending surface already knew:
// `?party=` from CRM, `?user=` from org members, `?candidate=` from Hiring,
// `?name=` from a search that found nobody. Each also PICKS THE MODE, so nobody
// re-chooses what the link they followed already decided.

import { Suspense } from "react";

import { HrNewEmployee } from "@/features/hr/people/new/HrNewEmployee";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "New employee" };

export default async function HrNewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{
    name?: string;
    party?: string;
    user?: string;
    candidate?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
      <HrNewEmployee
        prefill={{
          name: params.name ?? null,
          partyId: params.party ?? null,
          userId: params.user ?? null,
          candidateId: params.candidate ?? null,
        }}
      />
    </Suspense>
  );
}
