"use client";

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const SandboxStoragePage = lazy(
  () => import("@/app/(transitional)/settings/sandbox-storage/page"),
);

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
