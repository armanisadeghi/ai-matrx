import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/chat", {
  title: "Chat",
  description:
    "Chat with your agents, system agents, and community agents — a unified conversational surface.",
  letter: "CH",
  additionalMetadata: {
    keywords: [
      "AI chat",
      "agent chat",
      "conversational AI",
      "AI assistant",
      "AI Matrx",
    ],
  },
});

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="shell-hide-dock" aria-hidden="true" />
      {children}
    </>
  );
}
