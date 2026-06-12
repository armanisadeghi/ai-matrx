import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Request Mod",
  title: "Battle",
  description: "Battle-test request modification strategies.",
  letter: "Br",
});

export default function BattleRequestModLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
