import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/applets", {
  title: "Applets",
  description: "Build and run Applets on your own tables",
  letter: "AA",
});

export default function AppletsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
