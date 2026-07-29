// app/(core)/marketing/content-plan/[siteId]/page.tsx
//
// One site's Content Planning workspace (tree | table | map | entities |
// setup via ?view=). The site is a routed record under the feature's list
// page (/marketing/content-plan). Auth branches server-side; route chrome
// injects into the shell header; the body is the client workbench,
// full-height per (core) doctrine.

import { redirect } from "next/navigation";

import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ContentPlanHeader } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { ContentPlanWorkbench } from "@/features/marketing/content-plan/components/ContentPlanWorkbench";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

// Cookie-persisted tree|panel split (same pattern as /tasks) — read
// server-side so the first paint already has the user's sizes.
const LAYOUT_COOKIE = "panels:content-plan";

export default async function ContentPlanSitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(`/login?next=/marketing/content-plan/${siteId}`);
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
