import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";
import { AgentBrowsePage } from "@/features/agents/browse/components/AgentBrowsePage";

/**
 * /agents/all — the canonical Agents Hub feature-entry list.
 *
 * This route is the authenticated target of `/agents`; guests remain on the
 * public Agents landing page. The scope-driven, server-paginated list mounts
 * the shared entity-list shell and the `matrx-user/agents` surface runtime.
 * There is intentionally no speculative SSR seed: the authenticated scope,
 * sort, filters, and page are the query contract.
 */
export default async function AgentsListRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return (
    <>
      <PageHeader>
        <AgentsListHeader />
      </PageHeader>
      <AgentBrowsePage />
    </>
  );
}
