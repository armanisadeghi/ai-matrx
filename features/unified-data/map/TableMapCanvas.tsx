"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/** ONE next/dynamic({ ssr: false }) front door for the Map's drawing; React Flow stays static inside the Impl. */
const TableMapCanvas = dynamic(() => import("./TableMapCanvasImpl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default TableMapCanvas;
