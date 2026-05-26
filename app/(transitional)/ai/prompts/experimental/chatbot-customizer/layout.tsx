import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Customizer",
  title: "Prompts",
  description: "Customize and configure AI chatbot behavior",
  letter: "Cb",
});

export default function ChatbotCustomizerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
