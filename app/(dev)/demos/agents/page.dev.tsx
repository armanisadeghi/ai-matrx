import { join } from "path";
import {  } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export const metadata = createRouteMetadata("/demos/agents", {
  title: "Agent demos",
  description: "Interactive demos for agent UI components and chat patterns.",
});

export default async function AgentsDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "agents")}
      basePath="/demos/agents"
      title="Agent demos"
      description="Agent UI experiments and component playgrounds."
      icon={AGENT_ICON}
    />
  );
}
