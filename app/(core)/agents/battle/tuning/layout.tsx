import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Tuning",
  title: "Battle",
  description: "Battle-test agent tuning parameters.",
  letter: "Bn",
});

export default function BattleTuningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
