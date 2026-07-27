"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SandboxStoragePage from "@/features/settings/pages/SandboxStorageSettingsPage";

export default function SandboxStorageTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <div className="p-4 md:p-6">
        <SandboxStoragePage />
      </div>
    </Suspense>
  );
}
