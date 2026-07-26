"use client";

import React from "react";
import { InlineMediaRef } from "@/features/files";
import type { ArtifactRendererProps } from "../artifact-renderers";

/**
 * Unified renderer for `image` artifacts — chat, canvas, and artifact-card surfaces.
 *
 * DURABILITY: Uses <InlineMediaRef> (never a bare <img>) so that:
 *   - Owned files resolve via the lazy URL cache and self-heal expired signed URLs.
 *   - Public/CDN URLs are served directly without re-minting.
 *   - A plain URL string is accepted as the `ref` prop (MediaRef | string | null).
 *
 * Mirrors ArtifactBlock's `case "image"` branch exactly for prop shape:
 *   ref={src}, alt={title}, size="fill", fit="contain", rounded="md".
 */
export default function ImageArtifact({
    raw,
    data,
    metadata,
}: ArtifactRendererProps) {
    const src =
        typeof data === "string"
            ? data
            : ((data as { url?: string })?.url ?? raw ?? "");

    const alt = (metadata?.title as string) || "Image";

    return (
        <div className="flex items-center justify-center p-4 bg-muted/30">
            <InlineMediaRef
                ref={src}
                alt={alt}
                size="fill"
                fit="contain"
                rounded="md"
                className="max-w-full max-h-[400px]"
            />
        </div>
    );
}
