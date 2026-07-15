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

      <div className="w-full">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
          <AgentAppsGrid consumerId="apps-main" />
        </div>
      </div>
    </>
  );
}
