// /administration/database/relationships/explorer — entity relationship explorer entry.
//
// Pick any entity_types token, then open its orbit view as a full page
// (explorer/[token]) or peek at it in a WindowPanel.

import { createClient } from "@/utils/supabase/server";
import { RelationshipExplorerClient } from "@/features/admin/relationships/components/RelationshipExplorerClient";

export const metadata = {
  title: "Entity Explorer | Matrx Admin",
};

export default async function RelationshipExplorerPage() {
  const supabase = await createClient();

  const { data: rules, error } = await supabase.rpc("admin_relationship_rules");
  if (error) {
    throw new Error(`Entity explorer failed to load: ${error.message}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <RelationshipExplorerClient rules={rules ?? []} />
    </div>
  );
}
