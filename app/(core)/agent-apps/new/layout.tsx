import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-apps", {
  titlePrefix: "New",
  title: "Agent Apps",
  description: "Create a new AI-powered agent application",
  letter: "Ag",
});

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
