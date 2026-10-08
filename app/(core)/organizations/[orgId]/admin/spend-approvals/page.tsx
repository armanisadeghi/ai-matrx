"use client";

/**
 * Org admin › Spend approvals: this organization's agents, mandates and automations whose single
 * run cost more than the approval threshold; its admins approve or reject them.
 * billing.run_approval_list(p_org_id) refuses anyone who is not this organization's admin.
 * Route: /organizations/[orgId]/admin/spend-approvals  ([orgId] = slug or UUID)
 */
import Link from "next/link";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { orgAdminHref } from "@/features/organizations/admin/routes";
import { SpendApprovalsBoard } from "@/features/admin/spend-approvals/SpendApprovalsBoard";

export default function OrgSpendApprovalsPage() {
  const params = useParams();
  return (
    <OrgAdminBoundary orgIdParam={params.orgId as string}>
      {({ orgId, organization }) => (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-2 p-4 md:p-6">
          <Link href={orgAdminHref(organization.slug)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> User management
          </Link>
          <div className="min-h-0 flex-1">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/50" />}>
              <SpendApprovalsBoard orgId={orgId} seat="org" orgSlug={organization.slug} />
            </Suspense>
          </div>
        </div>
      )}
    </OrgAdminBoundary>
  );
}
