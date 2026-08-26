import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppsListHeader } from "@/features/agent-apps/components/shell/AgentAppsListHeader";
import { AgentAppsGridSkeleton } from "@/features/agent-apps/components/agent-app-listings/AgentAppsGridSkeleton";

export default function AgentAppsLoading() {
  return (
    <>
      <PageHeader>
        <AgentAppsListHeader />
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured">
        <div className="container mx-auto max-w-[1800px] px-4 pb-6 pt-[calc(var(--shell-header-h)+1rem)] sm:px-6 md:px-8 lg:px-12">
          <AgentAppsGridSkeleton />
        </div>
      </div>
    </>
  );
}
