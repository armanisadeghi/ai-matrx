// app/(core)/masterwork/all/page.tsx
//
// All Rulebooks — the canonical entity-list shell over platform.rulebook
// (the established `/x/all` pattern, like /agents/all). The module root
// `/masterwork` is the Masterwork landing page.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { MasterworkStudioPage } from "@/features/masterwork/browse/components/MasterworkStudioPage";

export default async function AllRulebooksRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/masterwork");
  return (
    <>
      <RecordPageHeader record={{ name: "All Rulebooks" }} />
      <MandateDoorLink feature="masterwork" label="Masterwork agents" className="ml-auto mr-1" />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        <MasterworkStudioPage />
      </div>
    </>
  );
}
