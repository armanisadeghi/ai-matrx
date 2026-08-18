import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { WorkflowsListHeader } from "@/features/workflow-runtime/browse/components/WorkflowsListHeader";
import { WorkflowBrowsePage } from "@/features/workflow-runtime/browse/components/WorkflowBrowsePage";

/**
 * /workflows/all — the signed-in workflow catalog, on the canonical entity-list
 * shell (lib/entity-list), exactly like /agents/all.
 *
 * It lives at /all rather than at /workflows because `/workflows` is reserved
 * for the public marketing page about workflows; until that exists, /workflows
 * redirects signed-in users here.
 *
 * No SSR seed on purpose: the list is scope-driven and server-paginated, so a
 * seed fetched before the user's scope/sort/page is known would be thrown away.
 */
export default async function WorkflowsListRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/workflows");

  return (
    <>
      <PageHeader>
        <WorkflowsListHeader />
      </PageHeader>
      <WorkflowBrowsePage />
    </>
  );
}
