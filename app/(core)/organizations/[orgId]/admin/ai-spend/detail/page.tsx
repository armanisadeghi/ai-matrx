"use client";

/**
 * Org admin › AI spend health › one agent / mandate: its numbers, flags and every run,
 * scoped to this organization (platform.agent_spend_runs(p_org_id) refuses non-admins).
 * Route: /organizations/[orgId]/admin/ai-spend/detail?agent=&mandate=&days=
 */
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { AgentSpendDetail } from "@/features/admin/agent-spend/AgentSpendDetail";
import { useSpendWindow } from "@/features/admin/agent-spend/useSpendWindow";

function Detail({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const params = useSearchParams();
  const [days, setDays] = useSpendWindow();
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <AgentSpendDetail
        orgId={orgId}
        seat="org"
        orgSlug={orgSlug}
        agentId={params.get("agent")}
        mandateKey={params.get("mandate")}
        days={days}
        onDaysChange={setDays}
      />
    </div>
  );
}

export default function OrgAgentSpendDetailPage() {
  const params = useParams();
  return (
    <OrgAdminBoundary orgIdParam={params.orgId as string}>
      {({ orgId, organization }) => (
        <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
          <Detail orgId={orgId} orgSlug={organization.slug} />
        </Suspense>
      )}
    </OrgAdminBoundary>
  );
}
