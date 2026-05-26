import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Templates",
  title: "Prompts",
  description: "Browse and manage prompt templates",
  letter: "PT",
});

export default function TemplatesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
