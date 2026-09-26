import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  // Every mode's tab reads "<Mode> | Battle"; Open mode is this root route.
  titlePrefix: "Open",
  title: "Battle",
  description: "Compare and battle-test agent configurations side by side.",
  letter: "BT",
});

export default function AgentBattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
