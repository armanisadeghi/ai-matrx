// features/administration/schema-visualizer/index.tsx
// Standalone schema visualizer — fetches schema overview from /api/schema-overview
// via React Query (no entity-system dependency).

"use client";

import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
    Background,
    Controls,
    type Node,
    type Edge,
    ConnectionMode,
    Panel,
    applyNodeChanges,
} from "reactflow";
import "reactflow/dist/style.css";
import { Loader2 } from "lucide-react";
import { createNodesAndEdges } from "./utils";
import { useSchemaQuery } from "./hooks/useSchemaQuery";
import SchemaNode from "./SchemaNode";
import { useResizeObserver } from "./useResizeObserver";

const nodeTypes = {
    schemaNode: SchemaNode,
};

export default function SchemaVisualizer() {
    const { data: overview, isLoading, isError, error } = useSchemaQuery();
    const [containerRef, { width, height }] = useResizeObserver();

    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    useEffect(() => {
        const { nodes: initialNodes, edges: initialEdges } = createNodesAndEdges(overview);
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [overview]);

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        [setNodes],
    );

    if (isLoading) {
        return (
            <div className="flex-1 min-h-dvh flex items-center justify-center bg-textured">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm">Loading database schema…</span>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex-1 min-h-dvh flex items-center justify-center bg-textured">
                <div className="text-center text-destructive">
                    <p className="font-medium">Failed to load schema</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        {error instanceof Error ? error.message : "Unknown error"}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex-1 min-h-dvh">
            <div className="absolute inset-0">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    connectionMode={ConnectionMode.Loose}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    className="bg-white dark:bg-gray-950"
                    minZoom={0.2}
                    maxZoom={1.5}
                    defaultEdgeOptions={{
                        type: "smoothstep",
                        style: {
                            stroke: "var(--tw-color-gray-400)",
                            strokeWidth: 2,
                        },
                        animated: true,
                    }}
                    draggable={true}
                >
                    <Background
                        color="var(--tw-color-gray-200)"
                        className="dark:!bg-gray-950"
                        gap={16}
                    />
                    <Controls
                        className="bg-textured border-gray-200 dark:border-gray-700 [&>button]:border-gray-200 dark:[&>button]:border-gray-700 [&>button]:bg-white dark:[&>button]:bg-gray-800 [&>button:hover]:bg-gray-50 dark:[&>button:hover]:bg-gray-700 [&>button]:text-gray-700 dark:[&>button]:text-gray-200"
                    />
                    <Panel
                        position="bottom-left"
                        className="bg-white/80 dark:bg-gray-900/80 p-2 rounded-lg backdrop-blur-sm border-border"
                    >
                        <div className="flex gap-3 text-gray-900 dark:text-white text-sm">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-blue-500 dark:bg-blue-400 rounded-full"></div>
                                <span>Foreign Key</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-green-500 dark:bg-green-400 rounded-full"></div>
                                <span>Many to Many</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-purple-500 dark:bg-purple-400 rounded-full"></div>
                                <span>Inverse Foreign Key</span>
                            </div>
                        </div>
                    </Panel>
                </ReactFlow>
            </div>
        </div>
    );
}
