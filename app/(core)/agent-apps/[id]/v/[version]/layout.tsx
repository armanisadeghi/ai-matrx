import { getAgentApp } from "@/lib/agent-apps/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { id, version } = await params;
  const app = await getAgentApp(id);
  return createDynamicRouteMetadata("/agent-apps", {
    titlePrefix: `v${version}`,
    title: app.name,
    description: `Version ${version} of ${app.name}.`,
    letter: "A",
  });
}

export default function AgentAppVersionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
