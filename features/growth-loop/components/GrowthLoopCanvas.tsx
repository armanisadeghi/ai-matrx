"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * ONE next/dynamic({ ssr: false }) front door for the Growth Loop canvas.
 * React Flow stays STATIC inside the Impl (code-splitting skill, rule 3).
 */
const GrowthLoopCanvas = dynamic(() => import("./GrowthLoopCanvasImpl"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full w-full items-center justify-center bg-textured">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    ),
});

export default GrowthLoopCanvas;
