"use client";

/**
 * Org admin › AI spend health: this organization's agents and mandates with spend,
 * most expensive first, with the spend-rule red flags, in points.
 * platform.agent_spend_health(p_org_id) refuses anyone who is not this organization's admin.
 * Route: /organizations/[orgId]/admin/ai-spend  ([orgId] = slug or UUID)
 */
import Link from "next/link";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { orgAdminHref } from "@/features/organizations/admin/routes";
import { AgentSpendBoard } from "@/features/admin/agent-spend/AgentSpendBoard";
import { useSpendWindow } from "@/features/admin/agent-spend/useSpendWindow";

function Board({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const [days, setDays] = useSpendWindow();
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-2 p-4 md:p-6">
      <Link href={orgAdminHref(orgSlug)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> User management
      </Link>
      <div className="min-h-0 flex-1">
        <AgentSpendBoard orgId={orgId} seat="org" orgSlug={orgSlug} days={days} onDaysChange={setDays} />
      </div>
    </div>
  );
}

export default function OrgAgentSpendPage() {
  const params = useParams();
  return (
    <OrgAdminBoundary orgIdParam={params.orgId as string}>
      {({ orgId, organization }) => (
        <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
          <Board orgId={orgId} orgSlug={organization.slug} />
        </Suspense>
      )}
    </OrgAdminBoundary>
  );
}
