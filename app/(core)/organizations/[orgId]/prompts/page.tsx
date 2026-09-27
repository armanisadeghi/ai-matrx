"use client";

/**
 * Organization Agents Page
 * Route: /organizations/[slug]/prompts (legacy URL — tile is now labeled "Agents")
 *
 * Lists agents owned by the org (`agent.definition.organization_id = orgId`) plus
 * agents explicitly shared with the org via the `permissions` table.
 */

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FaIndent } from "react-icons/fa6";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { useResolvedOrganization } from "@/features/organizations/hooks";
import { ReadFailure } from "@/components/read-state/ReadFailure";

const SELECT_COLS = "id, name, description, category, tags, updated_at";

// THE CANONICAL-SELECTION LAW: agent lists come from the scoped listing system
// (agx_list_scoped with a true scope), never a raw agent.definition query.
const fetchOwned = async (orgId: string) => {
  const res = await supabase.rpc("agx_list_scoped", {
    p_scope: "orgs",
    p_org_id: orgId,
    p_sort: "updated_at",
    p_dir: "desc",
    p_limit: 500,
    p_offset: 0,
  });
  if (res.error) throw res.error;
  return (res.data ?? []) as unknown as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.name as string | null) ?? "Untitled agent",
  subtitle: (row.description as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
  source,
});


export default function OrgAgentsPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  // The org is resolved by THE one resolver (RC-B12 r13): its read used to
  // log-and-null inside a bare effect, so a failure spun here forever.
  const {
    organizationId: resolvedOrgId,
    error: orgReadError,
    refresh: retryOrgRead,
  } = useResolvedOrganization(orgIdParam);


  return (
    <OrgResourceLayout
      resourceName="Agents"
    >
      {!resolvedOrgId && orgReadError != null ? (
        <ReadFailure error={orgReadError} what="this organization" onRetry={retryOrgRead} />
      ) : !resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="agent"
          tableName="definition"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          emptyTitle="No shared agents yet"
          emptyDescription="Agents created under this organization will appear here, along with agents other members share."
          emptyIcon={
            <FaIndent className="h-8 w-8 text-teal-600 dark:text-teal-400" />
          }
        />
      )}
    </OrgResourceLayout>
  );
}
