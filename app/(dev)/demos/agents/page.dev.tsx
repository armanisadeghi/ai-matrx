import {  } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/agents", {
  title: "Agent demos",
  description: "Interactive demos for agent UI components and chat patterns.",
});

export default async function AgentsDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "agents")}
      basePath="/demos/agents"
      title="Agent demos"
      description="Agent UI experiments and component playgrounds."
      icon={AGENT_ICON}
    />
  );
}
