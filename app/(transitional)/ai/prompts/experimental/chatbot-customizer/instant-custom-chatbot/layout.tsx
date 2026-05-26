import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Instant Bot",
  title: "Prompts",
  description: "Quick instant chatbot setup and deployment",
  letter: "IB",
});

export default function InstantCustomChatbotLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
