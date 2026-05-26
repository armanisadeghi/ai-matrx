import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "View",
  title: "Prompts",
  description: "View prompt details",
  letter: "PV",
});

export default function ViewPromptLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
