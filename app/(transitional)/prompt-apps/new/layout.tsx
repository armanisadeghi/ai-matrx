import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/prompt-apps", {
  titlePrefix: "New",
  title: "Prompt Apps",
  description: "Create a new AI-powered prompt application",
  letter: "Ap",
});

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
