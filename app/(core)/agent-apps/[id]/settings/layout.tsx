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
    titlePrefix: "Settings",
    title: app.name,
    description: `Settings for ${app.name}.`,
    letter: "Se",
  });
}

export default function AgentAppSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
