import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Variations",
  title: "Battle",
  description: "Battle-test agent prompt variations.",
  letter: "Bv",
});

export default function BattleVariationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
