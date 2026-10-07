import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/applets", {
  title: "Applets",
  description: "Create and manage your AI-powered agent applications",
  letter: "AA",
});

export default function AppletsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
