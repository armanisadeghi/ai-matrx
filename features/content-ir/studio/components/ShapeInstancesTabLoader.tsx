"use client";

// Client boundary that code-splits the heavy Instances tab (KindInputForm
// pulls ajv + the production input stack) — `ssr:false` must live in a
// client file. Mirrors ShapeTestTabLoader.

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ShapeInstancesTab = dynamic(
  () => import("@/features/content-ir/studio/components/ShapeInstancesTab"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading your instances</span>
      </div>
    ),
  },
);

export default ShapeInstancesTab;
