"use client";

// EntityPack wrapper removed during entity-isolation Phase 3 — the
// `(legacy)/layout.tsx` group layout now mounts EntityProviders (which
// includes EntityPack) for the whole legacy branch.
import { ModuleHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { filteredPages, MODULE_HOME, MODULE_NAME } from "./config";

export function AdminDashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <div className="flex flex-col h-full">
      <ModuleHeader
        pages={filteredPages}
        currentPath={currentPath}
        moduleHome={MODULE_HOME}
        moduleName={MODULE_NAME}
      />
      <main className="w-full h-full bg-textured">{children}</main>
    </div>
  );
}
