import React from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/workbooks", {
  title: "Workbooks",
  description: "Lossless spreadsheet workbooks",
});

export default function WorkbooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-200 scrollbar-none">
      {children}
    </div>
  );
}
