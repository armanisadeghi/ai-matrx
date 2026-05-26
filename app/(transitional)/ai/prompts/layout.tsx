import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  title: "Prompts",
  description: "Build and manage AI prompts",
});

export default function PromptsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
