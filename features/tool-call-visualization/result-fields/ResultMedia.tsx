"use client";

/**
 * ResultMedia — wraps the canonical {@link InlineMediaRef}. NEVER renders a
 * raw <img>/<video>/<audio>; the handler owns URL minting, durability, and
 * self-healing. Picks the element type from the MediaRef's mime hint / URL.
 */

import React from "react";
import { ExternalLink } from "lucide-react";
import { InlineMediaRef } from "@ai-matrx/media/react";
import type { MediaRef } from "@/features/files/types";
import { cn } from "@/lib/utils";

export interface ResultMediaProps {
    mediaRef: MediaRef;
    alt?: string;
    density?: "inline" | "full";
    className?: string;
}

interface InlineResultMediaProps {
    source: MediaRef;
    as: "img" | "video" | "audio";
    size: "fill" | "xl";
    alt: string;
}

/**
 * Isolate the package component's literal `ref=` media-source prop from the
 * React Compiler's React-ref analysis. This leaf only hands the value through;
 * all ordinary MediaRef reads stay in ResultMedia.
 */
function InlineResultMedia({ source, as, size, alt }: InlineResultMediaProps) {
    return <InlineMediaRef ref={source} as={as} size={size} fit="contain" alt={alt} fallback="icon" />;
}

/** Resolve which media element to render from the ref's hints. */
function pickElement(ref: MediaRef): "img" | "video" | "audio" {
    const mime = ref.mime_type?.toLowerCase() ?? "";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("image/")) return "img";

    const url = (ref.url ?? "").toLowerCase();
    if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/.test(url)) return "video";
    if (/\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/.test(url)) return "audio";
    return "img";
}

export const ResultMedia: React.FC<ResultMediaProps> = ({ mediaRef, alt, density = "inline", className }) => {
    const as = pickElement(mediaRef);
    const size = density === "full" ? "fill" : "xl";
    const viewerHref = mediaRef.file_id ? `/files/f/${encodeURIComponent(mediaRef.file_id)}` : null;

    return (
        <div
            className={cn(
                "overflow-hidden rounded-md border border-border bg-card",
                density === "full" ? "w-full max-w-2xl" : "w-fit max-w-full",
                className,
            )}
        >
            <InlineResultMedia source={mediaRef} as={as} size={size} alt={alt ?? "Tool result media"} />
            {viewerHref ? (
                <a
                    href={viewerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    aria-label="View in Files"
                    className="flex items-center justify-center gap-1.5 border-t border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Open</span>
                </a>
            ) : null}
        </div>
    );
};
