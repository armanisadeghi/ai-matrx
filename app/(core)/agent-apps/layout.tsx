import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-apps", {
  title: "Agent Apps",
  description: "Create and manage your AI-powered agent applications",
});

export default function AgentAppsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
