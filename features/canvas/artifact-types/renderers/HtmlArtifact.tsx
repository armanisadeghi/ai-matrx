"use client";

import React from "react";
import SandboxedHtml from "@/components/mardown-display/blocks/common/SandboxedHtml";
import type { ArtifactRendererProps } from "../artifact-renderers";

/**
 * Unified renderer for `html` artifacts — chat, canvas, and artifact-card surfaces.
 *
 * SECURITY: Author-supplied HTML is always rendered through SandboxedHtml
 * (a fully sandboxed iframe with an empty `sandbox` attribute — no scripts,
 * no same-origin, renders markup only). NEVER use dangerouslySetInnerHTML
 * for this type; CanvasBody's legacy dangerouslySetInnerHTML path is the bug
 * this renderer replaces.
 */
export default function HtmlArtifact({
    mode,
    raw,
    data,
    metadata,
}: ArtifactRendererProps) {
    const html =
        typeof data === "string"
            ? data
            : ((data as { html?: string })?.html ?? raw ?? "");

    const title = (metadata?.title as string) || "Content";
    const height = mode === "canvas" ? "100%" : 400;

    return (
        <SandboxedHtml
            html={html}
            title={title}
            height={height}
        />
    );
}
