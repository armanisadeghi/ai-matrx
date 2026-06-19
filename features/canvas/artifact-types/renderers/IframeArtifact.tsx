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
 * - External URLs: `allow-scripts allow-popups allow-forms` only.
 *   NO `allow-same-origin` — combining it with `allow-scripts` lets the
 *   framed page remove its own sandbox and reach aimatrx.com's origin (XSS).
 * - Inline HTML (srcDoc): `allow-scripts allow-forms` only, same reason.
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
