"use client";

import React, { Suspense, lazy } from "react";
import { AlertTriangle } from "lucide-react";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { kindServerDataFromStoredValue } from "@/features/content-ir/react/kind-route";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import ArtifactBlock from "./ArtifactBlock";

const MermaidBlock = lazy(() => import("../mermaid/MermaidBlock"));

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
    conversationId?: string;
    taskId?: string;
    /**
     * The inline `<artifact>` body + metadata from the message text. Used ONLY
     * as a fallback when the by-id load misses — i.e. the UUID is model-invented
     * / never persisted, the row was deleted, or a transient load failure. In
     * that case we render the inline archive body inline (vision R3: a bogus id
     * is ignored, the content still shows) instead of dead-ending on the amber
     * "couldn't load" card. The happy path (a real materialized row) never
     * touches these.
     */
    fallbackContent?: string;
    fallbackMetadata?: {
        artifactId?: string;
        artifactType?: string;
        artifactTitle?: string;
        version?: number;
        artifactIndex?: number;
    };
    fallbackServerData?: {
        artifactId?: string;
        artifactIndex?: number;
        artifactType?: string;
        title?: string;
        content?: string;
    } | null;
}

/**
 * Renders a MATERIALIZED artifact by id (vision R3).
 *
 * Triggered by BlockRenderer when a `<artifact …>` tag carries a real canvas
 * UUID (`isMaterializedArtifactId`). Loads the persisted `canvas_items` row by
 * id and hands its stored payload to the SAME ArtifactBlock renderer used during
 * streaming — so a reloaded artifact looks identical to the live one, but loads
 * by UUID (the live source of truth) instead of re-parsing the inline body (no
 * regeneration, stable identity). The inline body in the message text is the
 * model-facing archive; the UI never renders it once an id is present.
 */
const ArtifactRefBlock: React.FC<ArtifactRefBlockProps> = ({
    serverData,
    messageId,
    conversationId,
    taskId,
    fallbackContent,
    fallbackMetadata,
    fallbackServerData,
}) => {
    const artifactId = serverData?.artifact_id;
    // Registry-driven: userEditable types (mermaid, code, …) always show the
    // newest version in the chain. Prefer wire/metadata type; if the tag omits
    // type, load exact first then upgrade to latest once row.type is known —
    // never assume latest for unknown types (archive fidelity).
    const artifactTypeHint =
        serverData?.artifact_type ?? fallbackMetadata?.artifactType;
    const hintWantsLatest = Boolean(
        artifactTypeHint && getArtifactDef(artifactTypeHint)?.userEditable,
    );
    const exact = useCanvasItem(
        hintWantsLatest ? null : artifactId,
        { resolve: "exact" },
    );
    const discoveredWantsLatest = Boolean(
        !hintWantsLatest &&
            exact.row?.type &&
            getArtifactDef(exact.row.type)?.userEditable,
    );
    const latest = useCanvasItem(
        hintWantsLatest || discoveredWantsLatest ? artifactId : null,
        { resolve: "latest" },
    );
    const row = hintWantsLatest || discoveredWantsLatest ? latest.row : exact.row;
    const loading =
        hintWantsLatest || discoveredWantsLatest
            ? latest.loading || (discoveredWantsLatest && exact.loading)
            : exact.loading;
    const error =
        hintWantsLatest || discoveredWantsLatest ? latest.error : exact.error;

    if (loading) {
        return (
            <div className="my-3 rounded-lg border border-border bg-card p-4">
                <MatrxMiniLoader />
            </div>
        );
    }

    if (error || !row) {
        // The by-id load missed. If we have the inline archive body, render it
        // (vision R3: an invented / unresolved id is ignored, the content still
        // shows) rather than dead-ending. The id is deliberately dropped so
        // ArtifactBlock treats it as unmaterialized — no version history or
        // "open in canvas" against a row that isn't there.
        if (fallbackContent != null) {
            return (
                <ArtifactBlock
                    content={fallbackContent}
                    metadata={{
                        isComplete: true,
                        artifactId: undefined,
                        artifactIndex: fallbackMetadata?.artifactIndex,
                        artifactType: fallbackMetadata?.artifactType,
                        artifactTitle:
                            fallbackMetadata?.artifactTitle ?? serverData?.title,
                    }}
                    serverData={
                        fallbackServerData
                            ? { ...fallbackServerData, artifactId: undefined }
                            : undefined
                    }
                    messageId={messageId}
                    taskId={taskId}
                />
            );
        }

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

    // STRUCTURED (kind-IR) payload (Track 2B): content.data is the zero-loss
    // value OBJECT (self-describing via __kind). Derive the kind's serverData
    // directly — no text re-parse — and let the type renderer take its
    // serverData path (flashcards → FlashcardsBlock). Legacy string payloads
    // return null here and keep the raw-string path forever.
    const structuredServerData =
        stored && typeof stored === "object" && "data" in stored
            ? kindServerDataFromStoredValue(stored.data)
            : null;

    // Mermaid gets its first-class block (full toolbar: options, export,
    // source, edit-in-canvas) instead of the generic artifact chrome.
    if (row.type === "mermaid") {
        const storedMetadata =
            stored && typeof stored === "object" && "metadata" in stored
                ? (stored.metadata as Record<string, unknown> | undefined)
                : undefined;
        return (
            <Suspense
                fallback={
                    <div className="my-3 rounded-lg border border-border bg-card p-4">
                        <MatrxMiniLoader />
                    </div>
                }
            >
                <MermaidBlock
                    content={raw}
                    metadata={storedMetadata}
                    messageId={messageId}
                    taskId={taskId ?? `artifact:${row.id}`}
                    artifactId={row.id}
                    artifactVersion={row.version}
                />
            </Suspense>
        );
    }

    return (
        <ArtifactBlock
            content={raw}
            structuredServerData={structuredServerData}
            metadata={{
                isComplete: true,
                artifactId: row.id,
                artifactType: row.type,
                artifactTitle: row.title ?? serverData?.title ?? "Artifact",
            }}
            messageId={messageId}
            conversationId={conversationId}
            taskId={taskId ?? `artifact:${row.id}`}
        />
    );
};

export default ArtifactRefBlock;
