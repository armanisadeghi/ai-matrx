import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-context", {
  titlePrefix: "Analytics",
  title: "Agent Context",
  description: "Analytics for agent context usage.",
  letter: "X",
});

export default function ContextAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
