"use client";

import DatabaseAdminDashboard from "@/features/administration/database-admin/DatabaseAdminDashboard";

export default function DatabaseAdminPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <DatabaseAdminDashboard />
    </div>
  );
}
