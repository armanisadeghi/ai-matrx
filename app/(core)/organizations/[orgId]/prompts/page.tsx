"use client";

/**
 * Organization Agents Page
 * Route: /organizations/[slug]/prompts (legacy URL — tile is now labeled "Agents")
 *
 * Lists agents owned by the org (`agx_agent.organization_id = orgId`) plus
 * agents explicitly shared with the org via the `permissions` table.
 */

import React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FaIndent } from "react-icons/fa6";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, name, description, category, tags, updated_at";

const fetchOwned = async (orgId: string) => {
  const res = await supabase
    .schema("agent")
    .from("definition")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.name as string | null) ?? "Untitled agent",
  subtitle: (row.description as string | null) ?? null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
  source,
});

const getHref = (id: string) => `/agents/${id}`;

export default function OrgAgentsPage() {
  const params = useParams();
  const orgIdParam = params.orgId as string;
  const [resolvedOrgId, setResolvedOrgId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const org = await getOrganizationBySlugOrId(orgIdParam);
      if (!cancelled && org) setResolvedOrgId(org.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgIdParam]);

  return (
    <OrgResourceLayout
      resourceName="Agents"
      icon={<FaIndent className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="agent"
          tableName="agx_agent"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared agents yet"
          emptyDescription="Agents created under this organization will appear here, along with agents other members share."
          emptyIcon={<FaIndent className="h-8 w-8 text-teal-600 dark:text-teal-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
