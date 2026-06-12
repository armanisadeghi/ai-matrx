import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Battle",
  title: "Agents",
  description: "Compare and battle-test agent configurations side by side.",
  letter: "Bt",
});

export default function AgentBattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
