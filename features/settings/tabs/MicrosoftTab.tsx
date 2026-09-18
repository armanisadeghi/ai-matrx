"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { MicrosoftConnectPanel } from "@/features/microsoft-integration/MicrosoftConnectPanel";

export default function MicrosoftTab() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MicrosoftConnectPanel />
    </Suspense>
  );
}
