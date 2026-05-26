import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "New",
  title: "Prompts",
  description: "Create a new AI prompt",
  letter: "PN",
});

export default function NewPromptLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
