import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/prompt-apps", {
  title: "Prompt Apps",
  description: "Create and manage your AI-powered prompt applications",
});

export default function PromptAppsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
