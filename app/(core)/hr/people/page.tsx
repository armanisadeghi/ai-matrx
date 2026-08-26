// Route 10 — `/hr/people` · the employee directory (SPEC-UI-IA §3.2 row 10,
// SPEC-EMPLOYEES §2.2 / §5.1). The module's most-opened screen.
//
// The query lives entirely in the URL — `?q`, `?status`, `?department`,
// `?location`, `?title`, `?worker_class`, `?manager`, `?my_team`, `?page` —
// because `features/hr/routes.ts` builds DOORS out of exactly those names: a
// direct-report count opens `/hr/people?manager=<id>`, and a filtered list
// somebody pastes into a message has to resolve to the same list.

import { Suspense } from "react";

import { HrDirectory } from "@/features/hr/people/directory/HrDirectory";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "People" };

export default function HrPeoplePage() {
  return (
    // `useSearchParams` is the query's one owner, so the surface is a client
    // boundary under Suspense rather than a server component that would have to
    // be handed the same state twice.
    <Suspense fallback={<HrLoading variant="cards" rows={9} />}>
      <HrDirectory />
    </Suspense>
  );
}
