import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { DemosChatUiRegistrations } from "@/providers/DemosChatUiRegistrations";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/agents", {
  titlePrefix: "Agents",
  title: "Demos",
  description: "Agent UI demos and component playgrounds",
  letter: "AG",
});

export default function AgentsDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DemosChatUiRegistrations />
      <RouteHeaderData
        directory={appDir("(dev)", "demos", "agents")}
        moduleHome="/demos/agents"
        moduleName="Agent demos"
      >
        {children}
      </RouteHeaderData>
    </>
  );
}
