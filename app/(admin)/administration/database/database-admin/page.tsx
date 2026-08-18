"use client";

import { Suspense } from "react";
import DatabaseAdminDashboard from "@/features/administration/database-admin/DatabaseAdminDashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function DatabaseAdminPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
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
