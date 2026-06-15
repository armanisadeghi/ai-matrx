import { createRouteMetadata } from "@/utils/route-metadata";
import { ChatIncognitoProvider } from "@/features/agents/components/chat/ChatIncognitoProvider";
import { ChatIncognitoHeaderButton } from "@/features/agents/components/chat/ChatIncognitoHeaderButton";

export const metadata = createRouteMetadata("/chat", {
  title: "Chat",
  description:
    "Chat with your agents, system agents, and community agents — a unified conversational surface.",
  letter: "C",
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
    <ChatIncognitoProvider>
      <ChatIncognitoHeaderButton />
      {children}
    </ChatIncognitoProvider>
  );
}
