import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Model",
  title: "Battle",
  description: "Battle-test different models for the same agent prompt.",
  letter: "AG",
});

export default function BattleModelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
