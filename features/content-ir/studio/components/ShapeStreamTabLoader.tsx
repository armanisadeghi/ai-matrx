"use client";

// Client boundary that code-splits the Stream tab (it pulls the real
// StreamBlockAccumulator + SafeBlockRenderer stack) — `ssr:false` must live
// in a client file.

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ShapeStreamTab = dynamic(
  () => import("@/features/content-ir/studio/components/ShapeStreamTab"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading the simulator</span>
      </div>
    ),
  },
);

export default ShapeStreamTab;
