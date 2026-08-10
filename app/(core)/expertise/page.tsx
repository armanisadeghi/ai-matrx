// app/(core)/expertise/page.tsx
//
// Expertise LIST page — the expert's home for their packs (rulebooks).
// Canonical entity-list shell over platform.expertise_pack.

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ExpertiseBrowsePage } from "@/features/expertise/browse/components/ExpertiseBrowsePage";

export default async function ExpertiseListRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login");
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Expertise
          </h1>
        </div>
      </PageHeader>
      <ExpertiseBrowsePage />
    </>
  );
}
