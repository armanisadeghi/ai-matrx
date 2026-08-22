// app/(core)/masterwork/all/page.tsx
//
// All Rulebooks — the canonical entity-list shell over platform.rulebook
// (the established `/x/all` pattern, like /agents/all). The module root
// `/masterwork` is the Masterwork landing page.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MasterworkStudioPage } from "@/features/masterwork/browse/components/MasterworkStudioPage";

export default async function AllRulebooksRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/masterwork");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            All Rulebooks
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <MasterworkStudioPage />
      </div>
    </>
  );
}
