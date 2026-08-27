import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentsListHeader } from "@/features/agents/components/shell/AgentsListHeader";
import { AgentBrowsePage } from "@/features/agents/browse/components/AgentBrowsePage";
import { ADMIN_SYSTEM_AGENTS_LIST_SURFACE } from "@/features/agents/browse/adminSurface";

export const metadata = { title: "System Agents | Admin" };

/**
 * /administration/agents/system-agents/agents — the platform's own agent corpus.
 *
 * This is THE canonical agents list (`features/agents/browse`), opened on the
 * `system` scope. It is not a variant of that list and not a second UI over the
 * same table: the only thing this route declares is where the page starts.
 *
 * It used to be `SystemAgentsGrid` — a separate, much poorer grid that never
 * received server-side facets, sortable/filterable columns, the single action
 * registry, doors, or Orchestras. Aligning the two routes IS deleting that
 * component; a "kept in sync by hand" arrangement is the thing that failed.
 */
export default function AdminSystemAgentsListPage() {
  return (
    <>
      <PageHeader>
        <AgentsListHeader />
      </PageHeader>
      <AgentBrowsePage
        defaultScope={{ kind: "system" }}
        surface={ADMIN_SYSTEM_AGENTS_LIST_SURFACE}
      />
    </>
  );
}
