// app/(core)/marketing/content-plan/page.tsx
//
// The Content Plan LIST page — the feature's front door (canonical
// entry-list doctrine: a list of every site you can plan, never a forced
// workspace). Clicking a site opens its plan workspace at
// /marketing/content-plan/[siteId]. Legacy `?site=<id>` URLs (the pre-split
// single-route shape) redirect to the routed workspace.

import { redirect } from "next/navigation";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { ContentPlanListHeader } from "@/features/marketing/content-plan/components/ContentPlanListHeader";
import { PlanSitesList } from "@/features/marketing/content-plan/components/PlanSitesList";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function ContentPlanListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/login?next=/marketing/content-plan");
  }

  // Legacy single-route URLs: /marketing/content-plan?site=<id>&view=<v>.
  // Whitelist both values — a malformed ?site= falls through to the list
  // instead of producing a mangled destination URL.
  const params = await searchParams;
  const legacySite = typeof params.site === "string" ? params.site : null;
  if (legacySite && /^[0-9a-f-]{36}$/i.test(legacySite)) {
    const VIEWS = ["tree", "table", "map", "entities", "setup"];
    const view =
      typeof params.view === "string" && VIEWS.includes(params.view)
        ? `?view=${params.view}`
        : "";
    redirect(`/marketing/content-plan/${legacySite}${view}`);
  }

  return (
    <>
      <PageHeader>
        <ContentPlanListHeader />
      </PageHeader>
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <PlanSitesList />
      </div>
    </>
  );
}
