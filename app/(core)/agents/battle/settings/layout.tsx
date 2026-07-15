import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Settings",
  title: "Battle",
  description: "Battle-test agent settings configurations.",
  letter: "AG",
});

export default function BattleSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
