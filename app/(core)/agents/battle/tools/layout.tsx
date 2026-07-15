import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Tools",
  title: "Battle",
  description: "Battle-test agent tool configurations.",
  letter: "AG",
});

export default function BattleToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
