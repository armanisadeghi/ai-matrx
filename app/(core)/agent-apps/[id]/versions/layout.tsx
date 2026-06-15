import { getAgentApp } from "@/lib/agent-apps/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getAgentApp(id);
  return createDynamicRouteMetadata("/agent-apps", {
    titlePrefix: "Versions",
    title: app.name,
    description: `Version history for ${app.name}.`,
    letter: "A",
  });
}

export default function AgentAppVersionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
