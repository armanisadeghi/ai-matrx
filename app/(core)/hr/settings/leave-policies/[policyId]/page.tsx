import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeavePolicyEditorSurface } from "@/features/hr/leave/policies/LeavePolicyEditorSurface";
import { notFound } from "next/navigation";
import { isFullUuid } from "@/utils/supabase-search";

/**
 * Route 74a (SPEC-LEAVE §2.1, §18 AR-6) — the leave policy editor.
 *
 * `[policyId]` is either a policy id or the literal `new`: `hr_leave_policy_save` inserts when
 * the payload carries no `id`, so authoring and editing are ONE surface and there is no second
 * create route to drift from this one.
 *
 * No `PageHeader` — `HrSettingsChrome` owns the section chrome and the gates.
 */
export const metadata = { title: "Leave policy" };

export default async function Page({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;

  // 🚨 A MALFORMED ID IN THE URL IS REFUSED HERE, BEFORE ANY READ. Postgres casts
  // the route text to `uuid` inside the door and raises `22P02`, which reached the
  // person as a sentence about a value in the wrong format — on a READ, with no
  // form on screen and nothing to save (D11). The three `/hr/people/[employeeId]`
  // routes were guarded on 2026-08-28; the other nine dynamic HR routes were not.
  if (!isFullUuid(policyId)) notFound();
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
      <LeavePolicyEditorSurface policyId={policyId} />
    </Suspense>
  );
}
