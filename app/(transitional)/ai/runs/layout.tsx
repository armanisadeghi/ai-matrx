import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/runs", {
  title: "Runs",
  description: "View and manage AI execution runs",
});

export default function RunsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
