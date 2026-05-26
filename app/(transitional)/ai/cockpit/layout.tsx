// /layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/cockpit", {
  title: "Cockpit",
  description: "Your AI command center and builder hub",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-hidden">{children}</div>;
}
