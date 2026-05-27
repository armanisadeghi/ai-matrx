import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Resizable",
  title: "Demo",
  description: "Resizable panels, split views, and drag-to-resize interactions",
  letter: "Rz",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <main className="flex-1">{children}</main>
    </div>
  );
}
