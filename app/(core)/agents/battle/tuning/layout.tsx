import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Tuning",
  title: "Battle",
  description: "Battle-test agent tuning parameters.",
  letter: "AG",
});

export default function BattleTuningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
