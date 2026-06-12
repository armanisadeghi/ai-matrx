import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-apps", {
  titlePrefix: "Templates",
  title: "Agent Apps",
  description: "Browse agent app templates.",
  letter: "Tp",
});

export default function AgentAppTemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
