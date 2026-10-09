"use client";

/**
 * Org admin › Triggers — every workflow trigger of this organization that starts
 * AI work by itself, with cost, flags and Pause / Resume / Archive. Scoped by
 * scheduler.workflow_trigger_overview(p_org_id), which refuses anyone who is not
 * this organization's admin.
 * Route: /organizations/[orgId]/admin/triggers  ([orgId] = slug or UUID)
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { orgAdminHref } from "@/features/organizations/admin/routes";
import { TriggersManager } from "@/features/scheduling/components/triggers/TriggersManager";

export default function OrgTriggersPage() {
  const params = useParams();
  return (
    <OrgAdminBoundary orgIdParam={params.orgId as string}>
      {({ orgId, organization }) => (
        <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col gap-2 p-4 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={orgAdminHref(organization.slug)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> User management
              </Link>
              <h1 className="truncate text-xl font-semibold text-foreground">Triggers</h1>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <TriggersManager orgId={orgId} seat="org" orgSlug={organization.slug} />
          </div>
        </div>
      )}
    </OrgAdminBoundary>
  );
}
