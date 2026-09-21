import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Variations",
  title: "Battle",
  description: "Battle-test agent prompt variations.",
  letter: "BV",
});

export default function BattleVariationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
