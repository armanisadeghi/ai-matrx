import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

// Generate metadata for the Prompt Templates route
export const metadata = createRouteMetadata("/agents/templates", {
  title: "Agent Templates",
  description: "Browse and manage agent templates",
});

export default function TemplatesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
