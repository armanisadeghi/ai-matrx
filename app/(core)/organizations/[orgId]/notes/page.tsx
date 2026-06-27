"use client";

import React from "react";
import { useParams } from "next/navigation";
import { LuNotepadText } from "react-icons/lu";
import { Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

const SELECT_COLS = "id, label, updated_at, organization_id, created_by, tags";

const fetchOwned = async (orgId: string) => {
  const res = await supabase
    .from("notes")
    .select(SELECT_COLS)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return (res.data ?? []) as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => ({
  id: String(row.id),
  title: (row.label as string | null) ?? "Untitled",
  subtitle: null,
  updatedAt: (row.updated_at as string | null) ?? null,
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
  source,
});

const getHref = (id: string) => `/notes/${id}`;

export default function OrgNotesPage() {
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
      resourceName="Notes"
      icon={<LuNotepadText className="h-4 w-4" />}
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="note"
          tableName="notes"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          getHref={getHref}
          emptyTitle="No shared notes yet"
          emptyDescription="Notes you create with this organization as the context will appear here, along with notes other members share with this organization."
          emptyIcon={<LuNotepadText className="h-8 w-8 text-amber-600 dark:text-amber-400" />}
        />
      )}
    </OrgResourceLayout>
  );
}
