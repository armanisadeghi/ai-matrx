"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * ONE next/dynamic({ ssr: false }) front door for the map surface.
 *
 * InteractiveDiagramBlock is the platform's single React Flow diagram
 * renderer/editor; React Flow stays STATIC inside it (code-splitting skill,
 * rule 3). This file adds a boundary, not a second copy — nothing here is
 * imported statically by a route or server chunk.
 */
const MapCanvas = dynamic(
  () =>
    import("@/components/mardown-display/blocks/diagram/InteractiveDiagramBlock"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-textured">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default MapCanvas;
