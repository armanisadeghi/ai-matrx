import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Settings",
  title: "Battle",
  description: "Battle-test agent settings configurations.",
  letter: "Bs",
});

export default function BattleSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
