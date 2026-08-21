"use client";

/**
 * UrlChips — a URL rendered as a compact, clickable chip with a favicon and a
 * label that IDENTIFIES the link. Used wherever a tool result (or a progress
 * message) surfaces a link. Opens in a new tab, always `rel="noopener noreferrer"`.
 *
 * THE LABEL MUST TELL TWO LINKS APART. The label was once the bare domain,
 * which is fine for a one-off link and useless the moment several URLs share a
 * host: a broken-image audit's three evidence rows all read "example.com" and
 * the reader could not tell the rows apart (seen 2026-08-21 in `ResultTable`).
 * So the default label carries the path's identifying tail —
 * `example.com/…/hero-old.png` — and falls back to the bare domain only when
 * the URL genuinely has no path. Callers may still override with `label`.
 */

import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/** Percent-decode a path segment for display; junk stays as-is. */
function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * Default chip label: `domain`, `domain/only-segment`, or `domain/…/last-segment`.
 * When the path is empty but a query string carries the identity (`?id=42`),
 * the query stands in for the path. Exported for the guard test — the whole
 * point of this function is that two URLs on one host produce two labels.
 */
export function urlChipLabel(url: string): string {
    const href = url.trim();
    let parsed: URL;
    try {
        parsed = new URL(href);
    } catch {
        return href;
    }
    const domain = parsed.hostname.replace(/^www\./, "");
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
        const query = parsed.search.replace(/^\?/, "");
        return query ? `${domain}/?${query}` : domain;
    }
    const last = decodeSegment(segments[segments.length - 1]);
    return segments.length === 1 ? `${domain}/${last}` : `${domain}/…/${last}`;
}

/** Parse a URL → identifying label + hostname + favicon service URL. Safe on junk. */
function describeUrl(url: string): { label: string; favicon: string | null; href: string } {
    const href = url.trim();
    try {
        const domain = new URL(href).hostname.replace(/^www\./, "");
        const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
        return { label: urlChipLabel(href), favicon, href };
    } catch {
        // Not a parseable URL — show the raw string, no favicon.
        return { label: href, favicon: null, href };
    }
}

export interface UrlChipProps {
    url: string;
    /** Optional label shown instead of the derived domain/path label. */
    label?: string;
    className?: string;
}

export const UrlChip: React.FC<UrlChipProps> = ({ url, label, className }) => {
    const { label: derived, favicon, href } = describeUrl(url);
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={href}
            className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent",
                className,
            )}
        >
            {favicon ? (
                // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon, not app media
                <img src={favicon} alt="" width={14} height={14} className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" />
            ) : (
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{label ?? derived}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-60" />
        </a>
    );
};

export interface UrlChipsProps {
    urls: string[];
    className?: string;
}

/** A wrapping row of {@link UrlChip}s. */
export const UrlChips: React.FC<UrlChipsProps> = ({ urls, className }) => {
    if (urls.length === 0) return null;
    return (
        <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
            {urls.map((url, i) => (
                <UrlChip key={`${url}-${i}`} url={url} />
            ))}
        </div>
    );
};
