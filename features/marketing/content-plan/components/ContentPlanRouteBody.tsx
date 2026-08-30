// features/marketing/content-plan/components/ContentPlanRouteBody.tsx
//
// The Content Plan workspace as a ROUTE BODY — server component, shared by
// every view route under /marketing/<brand>/content/plan/<site>/… .
//
// The views are routes now (tree is the index; table, map, entities, setup and
// ai-runs are segments), and every one of them renders exactly this: the same
// header, the same workbench, the same cookie-persisted split. The active view
// is read from the path by `usePlanWorkspaceParams`, so the six route leaves
// are three lines each instead of six copies of this file.

import { redirect } from "next/navigation";

import { readLayoutCookie } from "@/features/resizable-panels/readLayoutCookie";
import { ContentPlanHeader } from "@/features/marketing/content-plan/components/ContentPlanHeader";
import { ContentPlanWorkbench } from "@/features/marketing/content-plan/components/ContentPlanWorkbench";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

/** Cookie-persisted tree|panel split (same pattern as /tasks). */
const LAYOUT_COOKIE = "panels:content-plan";

export async function ContentPlanRouteBody({
  loginNext,
}: {
  /** Where to return the viewer after signing in (this view's own URL). */
  loginNext: string;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(`/login?next=${encodeURIComponent(loginNext)}`);
  }

  const defaultLayout = await readLayoutCookie(LAYOUT_COOKIE);

  return (
    <>
      {/* ContentPlanHeader is an EntityModeHeader, which injects itself
        through RouteHeader -> PageHeader. Wrapping it in a second PageHeader
        nests one portal inside another and the header renders EMPTY. */}
      <ContentPlanHeader />
      <div className="h-full overflow-hidden">
        <ContentPlanWorkbench
          defaultLayout={defaultLayout}
          layoutCookieName={LAYOUT_COOKIE}
        />
      </div>
    </>
  );
}
