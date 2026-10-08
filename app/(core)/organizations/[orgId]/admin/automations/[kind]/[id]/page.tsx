"use client";

/**
 * Org admin › one automation: what it costs, how it behaves, and every run —
 * scoped to this organization by scheduler.automation_cost_rollup(p_org_id),
 * which refuses anyone who is not this organization's admin.
 * Route: /organizations/[orgId]/admin/automations/[kind]/[id]  ([orgId] = slug or UUID)
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { OrgAdminBoundary } from "@/features/organizations/admin/components/OrgAdminBoundary";
import { orgAdminHref } from "@/features/organizations/admin/routes";
import {
  AutomationCostDetail,
  useAutomationCosts,
} from "@/features/scheduling/components/costs/AutomationCostTable";

function OrgAutomationDetail({ orgId, orgSlug, kind, id }: { orgId: string; orgSlug: string; kind: string; id: string }) {
  const { rows, loading, error } = useAutomationCosts(orgId);
  const row = rows.find((r) => r.automation_id === id && r.automation_kind === kind);
  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 p-4 md:p-6">
      <Link
        href={orgAdminHref(orgSlug)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> User management
      </Link>
      {loading && !row ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading automation cost
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : !row ? (
        <div className="py-6 text-sm text-muted-foreground">
          This organization has no automation with this id.
        </div>
      ) : (
        <>
          <h1 className="text-lg font-semibold">{row.name}</h1>
          {row.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
          )}
          <AutomationCostDetail row={row} seat="org" orgSlug={orgSlug} />
        </>
      )}
    </div>
  );
}

export default function OrgAutomationCostPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const kind = params.kind as string;
  const id = params.id as string;
  return (
    <OrgAdminBoundary orgIdParam={orgIdParam}>
      {({ orgId, organization }) => (
        <OrgAutomationDetail orgId={orgId} orgSlug={organization.slug} kind={kind} id={id} />
      )}
    </OrgAdminBoundary>
  );
}
