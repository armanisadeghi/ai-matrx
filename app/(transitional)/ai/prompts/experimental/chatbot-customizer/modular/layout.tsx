import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Modular",
  title: "Prompts",
  description: "Build chatbots with modular components",
  letter: "MD",
});

export default function ModularChatbotLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
