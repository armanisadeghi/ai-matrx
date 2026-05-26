import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Card Demo",
  title: "Prompts",
  description: "Demonstration of dynamic card components for prompts",
  letter: "CD",
});

export default function CardDemoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
