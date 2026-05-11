// File: app/(a)/data/layout.tsx

import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

// Generate metadata with automatic favicon for the Data/Tables route
export const metadata = createRouteMetadata("/data", {
  title: "Tables",
  description: "Manage your data tables",
});

export default function DataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200 scrollbar-none">
      {/* Main content container */}
      {children}

      {/* Extra scroll space that inherits background */}
      <div className="h-24 bg-inherit" aria-hidden="true"></div>
    </div>
  );
}
