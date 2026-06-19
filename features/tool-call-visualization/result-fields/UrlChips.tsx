"use client";

/**
 * UrlChips — a URL rendered as a compact, clickable chip with a favicon and
 * the bare domain. Used wherever a tool result (or a progress message)
 * surfaces a link. Opens in a new tab, always `rel="noopener noreferrer"`.
 */

import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/** Parse a URL → hostname (sans `www.`) + favicon service URL. Safe on junk. */
function describeUrl(url: string): { domain: string; favicon: string | null; href: string } {
    const href = url.trim();
    try {
        const parsed = new URL(href);
        const domain = parsed.hostname.replace(/^www\./, "");
        const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
        return { domain, favicon, href };
    } catch {
        // Not a parseable URL — show the raw string, no favicon.
        return { domain: href, favicon: null, href };
    }
}

export interface UrlChipProps {
    url: string;
    /** Optional label shown instead of the bare domain. */
    label?: string;
    className?: string;
}

export const UrlChip: React.FC<UrlChipProps> = ({ url, label, className }) => {
    const { domain, favicon, href } = describeUrl(url);
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
            <span className="truncate">{label ?? domain}</span>
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
