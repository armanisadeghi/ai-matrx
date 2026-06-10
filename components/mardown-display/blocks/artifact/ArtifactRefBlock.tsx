"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import ArtifactBlock from "./ArtifactBlock";

interface ArtifactRefServerData {
    artifact_id?: string;
    artifact_type?: string;
    version?: number;
    artifact_index?: number;
    title?: string;
}

interface ArtifactRefBlockProps {
    /** The render-block `data` payload carrying the artifact_ref fields. */
    serverData?: ArtifactRefServerData | null;
    messageId?: string;
    taskId?: string;
}

/**
 * Renders a materialized artifact reference (`cx_artifact_ref` content block).
 *
 * Loads the persisted `canvas_items` row by id and hands its stored payload to
 * the SAME ArtifactBlock renderer used during streaming — so a reloaded
 * artifact looks identical to the live one, but loads by UUID instead of
 * re-parsing raw markdown (no regeneration, stable identity).
 */
const ArtifactRefBlock: React.FC<ArtifactRefBlockProps> = ({
    serverData,
    messageId,
    taskId,
}) => {
    const artifactId = serverData?.artifact_id;
    const { row, loading, error } = useCanvasItem(artifactId);

    if (loading) {
        return (
            <div className="my-3 rounded-lg border border-border bg-card p-4">
                <MatrxMiniLoader />
            </div>
        );
    }

    if (error || !row) {
        return (
            <div className="my-3 rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="truncate">
                        {serverData?.title || "Artifact"} — couldn't load saved
                        artifact
                    </span>
                </div>
            </div>
        );
    }

    // canvas_items.content is stored as { data: <raw payload>, type, metadata }.
    const stored = row.content as
        | { data?: unknown; type?: string; metadata?: unknown }
        | string
        | null;
    const raw =
        stored && typeof stored === "object" && "data" in stored
            ? typeof stored.data === "string"
                ? stored.data
                : JSON.stringify(stored.data ?? "")
            : typeof stored === "string"
              ? stored
              : JSON.stringify(stored ?? "");

    return (
        <ArtifactBlock
            content={raw}
            metadata={{
                isComplete: true,
                artifactId: row.id,
                artifactType: row.type,
                artifactTitle: row.title ?? serverData?.title ?? "Artifact",
            }}
            messageId={messageId}
            taskId={taskId ?? `artifact:${row.id}`}
        />
    );
};

export default ArtifactRefBlock;
