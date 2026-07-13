// /administration/relationships/rules — association rules registry (full CRUD).
//
// ?edit=<source:target:label> deep-links from the Overview drift panel open
// the matching rule's side-panel editor (consume-once — the client strips it).

import { createClient } from "@/utils/supabase/server";
import { RelationshipRulesClient } from "@/features/admin/relationships/components/RelationshipRulesClient";

export const metadata = {
  title: "Association Rules | Matrx Admin",
};

export default async function RelationshipRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();

  const { data: rules, error } = await supabase.rpc("admin_relationship_rules");
  if (error) {
    throw new Error(`Association rules failed to load: ${error.message}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <RelationshipRulesClient rules={rules ?? []} initialEditKey={edit} />
    </div>
  );
}
