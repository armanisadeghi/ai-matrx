"use client";

/** Read-only org-scoped resource inventory for one member. */
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";
import { Card } from "@/components/ui/card";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ORGANIZATIONS_SURFACE_NAME,
  createOrganizationsScope,
} from "@/features/surfaces/manifests/organizations.manifest";
import type { Organization } from "../../types";
import type { OrgMemberResource } from "../types";
import { recordUnavailableMessage } from "@/lib/records/recordUnavailable";
import { useOrgMemberDetail } from "../hooks";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface Props {
  orgId: string;
  organization: Organization;
  userId: string;
}

export const MEMBER_RESOURCE_COLUMNS: MatrxColumnDef<OrgMemberResource>[] = [
  {
    id: "type",
    header: "Resource type",
    accessorKey: "displayLabel",
    filter: "text",
    width: 240,
    cell: (row) => (
      <span className="font-medium text-foreground">{row.displayLabel}</span>
    ),
  },
  {
    id: "schema",
    header: "Schema",
    accessorKey: "schemaName",
    filter: "text",
    width: 150,
    mobileHidden: true,
  },
  {
    id: "table",
    header: "Table",
    accessorKey: "tableName",
    filter: "text",
    width: 180,
    mobileHidden: true,
  },
  {
    id: "count",
    header: "Count",
    accessorKey: "count",
    filter: "number",
    align: "right",
    width: 100,
    cell: (row) => formatCount(row.count),
  },
];

export function MemberResourcesView({ orgId, organization, userId }: Props) {
  const { member, loading, error, refresh } = useOrgMemberDetail(orgId, userId);
  if (loading && !member)
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading resources…
      </div>
    );
  if (!member)
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-lg border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error ?? recordUnavailableMessage("member", "unknown")}
        </Card>
      </div>
    );

  const label = member.displayName || member.email || "this member";
  const total = member.resources.reduce(
    (sum, resource) => sum + resource.count,
    0,
  );
  const getScope = () =>
    createOrganizationsScope({
      current_view: "workspace",
      org_id: organization.id,
      org_slug: organization.slug,
      org_name: organization.name,
      selected_member_id: userId,
      member_resource_total: total,
      member_resources: member.resources.map((resource) => ({
        resource_type: resource.resourceType,
        display_label: resource.displayLabel,
        schema_name: resource.schemaName,
        table_name: resource.tableName,
        count: resource.count,
      })),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ORGANIZATIONS_SURFACE_NAME}
      getScope={getScope}
    >
      <div className="flex h-full min-h-0 w-full flex-col gap-4 p-4 md:p-6">
        <Link
          href={`/organizations/${organization.slug}/admin/users/${userId}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {label}
        </Link>
        <p className="shrink-0 text-sm text-muted-foreground">
          {total} resource{total === 1 ? "" : "s"} owned by {label} within{" "}
          {organization.name}. Personal-org resources are not shown and are
          never affected.
        </p>
        {error && (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-2 text-sm text-destructive"
          >
            Could not refresh resources: {error}
            <button type="button" className="underline" onClick={refresh}>
              Retry
            </button>
            <ErrorAlchemyMenu className="ml-auto" />
          </div>
        )}
        <div className="min-h-0 flex-1">
          <MatrxDataTable
            tableId="organizations-admin-member-resources"
            data={member.resources}
            columns={MEMBER_RESOURCE_COLUMNS}
            getRowId={(resource) => resource.resourceType}
            isLoading={loading && !member}
            isFetching={loading && Boolean(member)}
            coverage={{
              noun: "org-scoped resource type",
              answeredBy: "client",
              total: member.resources.length,
            }}
            toolbar={{
              title: "Org-scoped resources",
              searchPlaceholder: "Search resource types or locations…",
              refresh: { onRefresh: async () => refresh() },
            }}
            emptyState={{
              title:
                "This member owns no org-scoped resources in this organization.",
            }}
          />
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
