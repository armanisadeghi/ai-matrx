"use client";

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const IntegrationsPage = lazy(
  () => import("@/app/(transitional)/settings/integrations/page"),
);

export default function IntegrationsTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <IntegrationsPage />
    </Suspense>
  );
}
