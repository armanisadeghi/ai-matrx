"use client";

// Front-door dynamic gate for the schema visualizer (Method B — see the
// code-splitting skill). React Flow (reactflow) is heavy and browser-only;
// SchemaVisualizerImpl (+ SchemaNode, utils) stays STATIC inside this one
// boundary. Never import SchemaVisualizerImpl directly.
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const SchemaVisualizer = dynamic(() => import("./SchemaVisualizerImpl"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    ),
});

export default SchemaVisualizer;
