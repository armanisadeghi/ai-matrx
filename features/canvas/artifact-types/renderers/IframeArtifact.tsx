"use client";

import React from "react";
import type { ArtifactRendererProps } from "../artifact-renderers";

/**
 * Only http(s) embeds are allowed for iframe `src` — blocks javascript:/data: URIs.
 * Mirrors the helper in PublicCanvasRenderer.tsx.
 */
function safeEmbedUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    try {
        const u = new URL(value, "https://invalid.local");
        return u.protocol === "http:" || u.protocol === "https:" ? value : null;
    } catch {
        return null;
    }
}

/**
 * Unified renderer for `iframe` artifacts — chat, canvas, and artifact-card surfaces.
 *
 * SECURITY notes:
 * - External URLs: `allow-scripts allow-same-origin allow-popups allow-forms
 *   allow-presentation`. `allow-same-origin` is SAFE here because the framed
 *   page is a different origin (the published page lives on the html site, not
 *   aimatrx.com): the flag only grants the page same-origin privileges relative
 *   to ITS OWN origin, so it cannot reach ours. It is REQUIRED for embedded
 *   players (YouTube/Vimeo) — without it the player initializes to a black
 *   frame. The `allow` attribute + allowFullScreen enable media playback.
 * - Inline HTML (srcDoc): `allow-scripts allow-forms` only — NO
 *   `allow-same-origin`, because a srcDoc document inherits the PARENT origin,
 *   so combining the two would let it script aimatrx.com (XSS).
 * - Only http/https URLs are permitted for `src`; javascript:/data: URIs are blocked.
 */
export default function IframeArtifact({
    mode,
    raw,
    data,
    metadata,
}: ArtifactRendererProps) {
    const payload =
        typeof data === "string"
            ? data
            : ((data as { url?: string })?.url ?? raw ?? "");

    const title = (metadata?.title as string) || "Web View";
    const height = mode === "canvas" ? "100%" : "400px";

    const safeUrl = safeEmbedUrl(payload);

    if (safeUrl) {
        return (
            <iframe
                src={safeUrl}
                sandbox="allow-scripts allow-popups allow-forms"
                className="w-full border-0"
                style={{ height, minHeight: "300px" }}
                title={title}
            />
        );
    }

    // Inline HTML payload (srcDoc) — no allow-same-origin.
    return (
        <iframe
            srcDoc={payload}
            sandbox="allow-scripts allow-forms"
            className="w-full border-0"
            style={{ height, minHeight: "300px" }}
            title={title}
        />
    );
}
