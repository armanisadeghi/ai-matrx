"use client";

// /organizations/[orgId]/settings/mandates — the ORG-scoped mandate surface.
// The organization is fixed by the route (Arman's ruling: the personal
// /agents/mandates page carries NO org editing; admins manage their org HERE).
// Same canonical list shell; the doors lead to the org-principal workspace.

import { useParams } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "@/lib/toast";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import {
  useResolvedOrganization,
  useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { mandateListConfig } from "@/features/agents/mandates/browse/listConfig";
import type { MandateListRow } from "@/features/agents/mandates/browse/types";

function orgMandateRoute(orgId: string, row: Pick<MandateListRow, "mandate_key">) {
  return `/organizations/${encodeURIComponent(orgId)}/settings/mandates/${encodeURIComponent(row.mandate_key)}`;
}

export default function OrgMandatesPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { organization, organizationId, loading, error, refresh } =
    useResolvedOrganization(orgId);
  const { loading: roleLoading, isOwner, isAdmin } = useUserRole(
    organizationId ?? undefined,
  );

  // Route-scoped row actions: everything opens the ORG workspace route. The
  // window panel stays personal-principal, so it is deliberately absent here.
  const useOrgRowActions = (
    _list: EntityListController<MandateListRow>,
  ): EntityRowActionsResult<MandateListRow> => ({
    actions: {
      menuFor: (row) => (): ItemMenuConfig => ({
        sections: [
          {
            id: "open",
            items: [
              {
                id: "open",
                label: "Manage for this organization",
                icon: ExternalLink,
                kind: "link",
                href: orgMandateRoute(orgId, row),
              },
              {
                id: "open-new-tab",
                label: "Open in new tab",
                icon: ExternalLink,
                kind: "link",
                href: orgMandateRoute(orgId, row),
                target: "_blank",
              },
              {
                id: "copy-link",
                label: "Copy link",
                icon: Link2,
                onSelect: () => {
                  void navigator.clipboard
                    .writeText(`${window.location.origin}${orgMandateRoute(orgId, row)}`)
                    .then(() => toast.success("Link copied."));
                },
              },
            ],
          },
        ],
      }),
      onOpenRow: (row) => {
        window.location.assign(orgMandateRoute(orgId, row));
      },
    },
  });

  if (loading || roleLoading) return null;
  if (error || !organization || !(isOwner || isAdmin)) {
    return <OrganizationAccessGate orgSlugOrId={orgId} organizationId={organizationId} onRetry={refresh} />;
  }

  return (
    <>
      <PageHeader>
        <CrumbTrailHeader
          trail={[
            { label: organization.name, href: `/organizations/${orgId}` },
            { label: "Settings", href: `/organizations/${orgId}/settings` },
            { label: "Mandates" },
          ]}
        />
      </PageHeader>
      <EntityListPage
        config={{
          ...mandateListConfig,
          surfaceKey: "org-mandates",
          door: { hrefFor: (row) => orgMandateRoute(orgId, row) },
          useRowActions: useOrgRowActions,
        }}
        notice={
          <p className="rounded-lg border border-border/60 bg-card px-3 py-2 text-[12px] text-muted-foreground">
            Bindings made here apply to every member of{" "}
            <span className="font-medium text-foreground">{organization.name}</span>{" "}
            (a member&apos;s personal override still wins for themselves).{" "}
            <Link href="/agents/mandates" className="underline">
              Your personal surface
            </Link>
          </p>
        }
      />
    </>
  );
}
