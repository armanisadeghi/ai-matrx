import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/agents", {
  titlePrefix: "Agents",
  title: "Demos",
  description: "Agent UI demos and component playgrounds",
  letter: "Ag",
});

export default function AgentsDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteHeaderData
      directory={join(process.cwd(), "app", "(dev)", "demos", "agents")}
      moduleHome="/demos/agents"
      moduleName="Agent demos"
    >
      {children}
    </RouteHeaderData>
  );
}
