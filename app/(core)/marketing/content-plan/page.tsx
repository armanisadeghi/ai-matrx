// app/(core)/content-plan/page.tsx
//
// Server Component page for the Content Planning workspace
// (features/marketing/content-plan — see its FEATURE.md). Auth branches server-side;
// route chrome injects into the shell header; the body is the client
// workbench, full-height per (core) doctrine.

import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { ContentPlanHeader } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { ContentPlanWorkbench } from "@/features/marketing/content-plan/components/ContentPlanWorkbench";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function ContentPlanPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan");
  }

  return (
    <>
      <PageHeader>
        <ContentPlanHeader />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <ContentPlanWorkbench />
      </div>
    </>
  );
}
