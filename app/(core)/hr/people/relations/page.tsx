// Route 15 — `/hr/people/relations` (SPEC-UI-IA §3.2, SPEC-EMPLOYEES §2.2).
//
// 🚨 THE NAV ITEM AND THE ROUTE ARE ABSENT for anyone without an incident or
// corrective-action lane. This file exists so a typed URL or a stale link
// resolves; the page it renders refuses in place, in the persona's nearest
// legitimate surface, and never leaks that a record exists.
//
// 🚨 NO EXPORT ON THIS ROUTE IN V1. A CSV of complaints is exactly the artifact
// that should not exist by accident.

import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { RelationsCaseList } from "@/features/hr/people/relations/components/RelationsCaseList";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Employee relations" };

export default function HrRelationsPage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Employee relations</h1>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<HrLoading variant="table" />}>
            <RelationsCaseList />
          </Suspense>
        </div>
      </div>
    </>
  );
}
