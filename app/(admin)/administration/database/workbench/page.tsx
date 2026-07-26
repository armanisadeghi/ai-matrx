import React from "react";
import { WorkbenchClient } from "@/features/administration/database-admin/workbench/WorkbenchClient";

export const metadata = {
  title: "SQL Workbench",
  description: "Multi-query notebook with shared variables and result merging",
};

export default function WorkbenchPage() {
  return (
    <div className="h-full w-full overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        <WorkbenchClient />
      </div>
    </div>
  );
}
