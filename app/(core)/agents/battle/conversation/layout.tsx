import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Conversation",
  title: "Battle",
  description:
    "Fork one existing conversation into independent side-by-side continuations.",
  letter: "BC",
});

export default function BattleConversationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
