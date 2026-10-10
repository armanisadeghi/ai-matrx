// Route 15 — `/hr/people/relations` (SPEC-UI-IA §3.2, SPEC-EMPLOYEES §2.2).
//
// 🚨 THE NAV ITEM AND THE ROUTE ARE ABSENT for anyone without an incident or
// corrective-action lane. This file exists so a typed URL or a stale link
// resolves; the page it renders refuses in place, in the persona's nearest
// legitimate surface, and never leaks that a record exists.
//
// 🚨 NO EXPORT ON THIS ROUTE IN V1. A CSV of complaints is exactly the artifact
// that should not exist by accident.

import { hrHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { RelationsCaseList } from "@/features/hr/people/relations/components/RelationsCaseList";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Employee relations" };

export default async function HrRelationsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  return (
    <>
      <RecordPageHeader
        backHref={hrHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
        ]}
        record={{ name: "Employee relations" }}
      />
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
