import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Tools",
  title: "Battle",
  description: "Battle-test agent tool configurations.",
  letter: "BTT",
});

export default function BattleToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
