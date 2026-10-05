import { FactoryBuildsPage } from "@/features/agents/factory/components/FactoryBuildsPage";

export const metadata = {
  title: "Agent Factory | Admin",
  description: "Every Agent Factory build, step by step",
};

/**
 * /administration/agents/factory — the Agent Factory's builds (row AF-W of the
 * Agent Factory pipeline REGISTER). Platform scope: every build, never the
 * admin's own only.
 */
export default function AgentFactoryBuildsRoute() {
  return <FactoryBuildsPage />;
}
