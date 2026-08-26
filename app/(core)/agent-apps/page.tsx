import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppsGrid } from "@/features/agent-apps/components/agent-app-listings/AgentAppsGrid";
import { AgentAppsListHeader } from "@/features/agent-apps/components/shell/AgentAppsListHeader";
import AgentAppsLanding from "@/features/auth/components/module-landing/landings/AgentAppsLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function AgentAppsListPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <AgentAppsLanding />;
  return (
    <>
      <PageHeader>
        <AgentAppsListHeader />
      </PageHeader>

      <div className="h-full overflow-y-auto bg-textured">
        <div className="container mx-auto max-w-[1800px] px-4 pb-6 pt-[calc(var(--shell-header-h)+1rem)] sm:px-6 md:px-8 lg:px-12">
          <AgentAppsGrid consumerId="apps-main" />
        </div>
      </div>
    </>
  );
}
