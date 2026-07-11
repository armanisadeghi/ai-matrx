// /administration/relationships/[token] — Entity relationship explorer.
//
// One entity_types token: what targets it (sources, left) and what it
// targets (targets, right), derived from the same admin_relationship_rules()
// rows the Relationship Manager list page uses. Super Admin gate inherited
// from app/(admin)/layout.tsx.

import { notFound } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { EntityRelationshipOrbitPageBody } from "@/features/admin/relationships/components/EntityRelationshipOrbitPageBody";
import { EntityExplorerHeader } from "@/features/admin/relationships/components/EntityExplorerHeader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const label = tryGetEntityInfo(token)?.label ?? token;
  return { title: `${label} relationships | Matrx Admin` };
}

export default async function EntityRelationshipExplorerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!tryGetEntityInfo(token)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: rules, error } = await supabase.rpc("admin_relationship_rules");
  if (error) {
    throw new Error(`Entity explorer failed to load: ${error.message}`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <EntityExplorerHeader token={token} rules={rules ?? []} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EntityRelationshipOrbitPageBody token={token} rules={rules ?? []} />
      </div>
    </div>
  );
}
