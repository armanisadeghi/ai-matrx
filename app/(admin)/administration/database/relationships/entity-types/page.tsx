// /administration/database/relationships/entity-types — platform.entity_types registry
// admin (first-ever UI write path; previously migration-only). Full CRUD with
// deactivate-only deletion via the admin_entity_types_* RPCs.

import { createClient } from "@/utils/supabase/server";
import { EntityTypesClient } from "@/features/admin/relationships/components/EntityTypesClient";
import { ChooserBucketsManager } from "@/features/admin/relationships/components/ChooserBucketsManager";

export const metadata = {
  title: "Entity Types | Matrx Admin",
};

export default async function EntityTypesAdminPage() {
  const supabase = await createClient();

  const { data: entityTypes, error } = await supabase.rpc(
    "admin_entity_types_list",
  );
  if (error) {
    throw new Error(`Entity types registry failed to load: ${error.message}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-muted-foreground">
            Loading entity types…
          </div>
        }
      >
        <EntityTypesClient entityTypes={entityTypes ?? []} />
        <ChooserBucketsManager />
      </Suspense>
    </div>
  );
}
import { Suspense } from "react";
