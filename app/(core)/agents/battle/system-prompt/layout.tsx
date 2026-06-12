import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "System Prompt",
  title: "Battle",
  description: "Battle-test system prompt variants.",
  letter: "Bp",
});

export default function BattleSystemPromptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
