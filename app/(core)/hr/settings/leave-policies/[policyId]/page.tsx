import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { LeavePolicyEditorSurface } from "@/features/hr/leave/policies/LeavePolicyEditorSurface";

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
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={8} />}>
      <LeavePolicyEditorSurface policyId={policyId} />
    </Suspense>
  );
}
