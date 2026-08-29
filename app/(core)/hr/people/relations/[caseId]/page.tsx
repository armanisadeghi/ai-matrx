// Route 16 — `/hr/people/relations/[caseId]` (SPEC-EMPLOYEES §2.2).
//
// `?kind=` tells the surface which of the two audited doors to open. Without
// it the case is found by probing both, and the losing probe writes a denial
// into `hr.access_audit` — correct behaviour, but a link should not cause it.

import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { CaseSurface } from "@/features/hr/people/relations/components/CaseSurface";
import { HrLoading } from "@/features/hr/shared/HrStates";
import type { HrCaseKind } from "@/features/hr/people/relations/types";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

export const metadata = { title: "Case" };

export default async function HrRelationsCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { caseId } = await params;

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(caseId)) notFound();
  const { kind } = await searchParams;
  const hintedKind: HrCaseKind | null =
    kind === "incident" || kind === "corrective_action" ? kind : null;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Case</h1>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<HrLoading variant="panel" />}>
            <CaseSurface caseId={caseId} hintedKind={hintedKind} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
