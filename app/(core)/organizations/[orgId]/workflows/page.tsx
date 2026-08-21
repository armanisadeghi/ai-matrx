"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Workflow, Loader2 } from "lucide-react";
import { OrgResourceLayout } from "../OrgResourceLayout";
import { OrgResourceList } from "@/features/organizations/components/OrgResourceList";
import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";

/**
 * Org → Workflows tile.
 *
 * The owned half reads `workflow.v_definition_catalog` — the SAME catalog
 * projection /workflows/all is built on, so this tile cannot drift from the
 * main workflow list. The view is `security_invoker` (RLS is the ceiling) and
 * already excludes soft-deleted rows, so the only predicate this surface owns
 * is "owned by THIS org, not archived".
 *
 * It previously read `fromDeprecatedTable("workflow", ...)`, a shim that never
 * queried Postgres at all: it resolved `{data: null}` and console.error'd. The
 * page therefore rendered "No shared workflows yet" forever — silent to the
 * user, loud only in the browser console, which is why it survived. The live
 * model is `workflow.definition` (the old `public.workflow` is in `graveyard`).
 *
 * The SHARED half is hydrated by OrgResourceList from the physical table the
 * shareable-resource registry names for `workflow` (= `workflow.definition`),
 * which is why `selectColumns` is a `definition` projection, not a view one.
 */

/** Projection for the SHARED half (hydrated from `workflow.definition`). */
const SELECT_COLS = "id, name, description, category, version, updated_at";

/** Projection for the OWNED half (the catalog view — richer, no `version`). */
const CATALOG_COLS =
  "id, name, description, category, step_count, updated_at";

const fetchOwned = async (orgId: string) => {
  const { data, error } = await supabase
    .schema("workflow")
    .from("v_definition_catalog")
    .select(CATALOG_COLS)
    .eq("organization_id", orgId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) {
    // Loud, never silent: an empty list and a failed query look identical.
    console.error("[org/workflows] owned query failed:", error);
    throw operationFailed("load this organization's workflows", error);
  }
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
};

const mapRow = (row: Record<string, unknown>, source: "owned" | "shared") => {
  const stepCount = row.step_count as number | null | undefined;
  return {
    id: String(row.id),
    title: (row.name as string | null) ?? "Untitled workflow",
    subtitle: (row.description as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    tags: [
      row.category as string | null,
      typeof stepCount === "number"
        ? `${stepCount} step${stepCount === 1 ? "" : "s"}`
        : null,
      row.version ? `v${row.version}` : null,
    ].filter((v): v is string => Boolean(v)),
    source,
  };
};

export default function OrgWorkflowsPage() {
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
      resourceName="Workflows"
    >
      {!resolvedOrgId ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrgResourceList
          orgId={resolvedOrgId}
          resourceType="workflow"
          tableName="definition"
          selectColumns={SELECT_COLS}
          ownedQuery={fetchOwned}
          mapRow={mapRow}
          emptyTitle="No shared workflows yet"
          emptyDescription="Workflows owned by this organization will appear here, along with workflows other members share."
          emptyIcon={
            <Workflow className="h-8 w-8 text-violet-600 dark:text-violet-400" />
          }
        />
      )}
    </OrgResourceLayout>
  );
}
