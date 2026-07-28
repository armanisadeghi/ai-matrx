// app/(core)/content-plan/page.tsx
//
// Server Component page for the Content Planning workspace
// (features/marketing/content-plan — see its FEATURE.md). Auth branches server-side;
// route chrome injects into the shell header; the body is the client
// workbench, full-height per (core) doctrine.

import { redirect } from "next/navigation";

import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ContentPlanHeader } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { ContentPlanWorkbench } from "@/features/marketing/content-plan/components/ContentPlanWorkbench";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

// Cookie-persisted tree|panel split (same pattern as /tasks) — read
// server-side so the first paint already has the user's sizes.
const LAYOUT_COOKIE = "panels:content-plan";

export default async function ContentPlanPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan");
  }

  const defaultLayout = await readLayoutCookie(LAYOUT_COOKIE);

  return (
    <>
      <PageHeader>
        <ContentPlanHeader />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <ContentPlanWorkbench
          defaultLayout={defaultLayout}
          layoutCookieName={LAYOUT_COOKIE}
        />
      </div>
    </>
  );
}
