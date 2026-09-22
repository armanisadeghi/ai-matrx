"use client";

import { Suspense } from "react";
import DatabaseAdminDashboard from "@/features/administration/database-admin/DatabaseAdminDashboard";
import { Skeleton } from "@ai-matrx/design-system";

export default function DatabaseAdminPage() {
  return (
    <div className="min-h-full">
      <Suspense
        fallback={
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <DatabaseAdminDashboard />
      </Suspense>
    </div>
  );
}
