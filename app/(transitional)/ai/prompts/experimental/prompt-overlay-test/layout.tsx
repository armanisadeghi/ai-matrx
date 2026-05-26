import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Overlay",
  title: "Prompts",
  description: "Test and validate prompt overlay functionality",
  letter: "OL",
});

export default function PromptOverlayTestLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
