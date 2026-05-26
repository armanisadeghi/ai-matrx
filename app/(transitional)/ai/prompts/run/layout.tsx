import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Run",
  title: "Prompts",
  description: "Execute and test an AI prompt",
  letter: "PR",
});

export default function RunPromptLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
