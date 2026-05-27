import Link from "next/link";
import { AppWindow, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppsGrid } from "@/features/agent-apps/components/agent-app-listings/AgentAppsGrid";

export default function AgentAppsListPage() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center justify-between w-full p-3">
          <div className="flex items-center gap-2">
            <AppWindow className="h-5 w-5 text-primary flex-shrink-0" />
            <h1 className="text-base font-bold text-foreground">Agent Apps</h1>
          </div>
          <Link href="/agent-apps/new">
            <Button size="sm" className="h-7 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New app
            </Button>
          </Link>
        </div>
      </PageHeader>

      <div className="h-page w-full overflow-auto">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
          <AgentAppsGrid consumerId="apps-main" />
        </div>
      </div>
    </>
  );
}
