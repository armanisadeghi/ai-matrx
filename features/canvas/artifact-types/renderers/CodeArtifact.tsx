"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../artifact-renderers";

const CodeBlock = lazy(
    () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

/**
 * Unified renderer for `code` artifacts — chat, canvas, and artifact-card surfaces.
 *
 * Resolves both the code string and language from the data/raw payload.
 * CodeBlock accepts: code (string), language (string), isStreamActive (boolean).
 * Matches the prop shape used in ArtifactBlock's `case "code"` branch.
 */
export default function CodeArtifact({
    raw,
    data,
    isStreamActive,
}: ArtifactRendererProps) {
    const code =
        typeof data === "string"
            ? data
            : ((data as { code?: string })?.code ?? raw ?? "");

    const language =
        (data as { language?: string })?.language ?? "text";

    return (
        <Suspense fallback={<MatrxMiniLoader />}>
            <CodeBlock
                code={code}
                language={language}
                isStreamActive={isStreamActive}
            />
        </Suspense>
    );
}
