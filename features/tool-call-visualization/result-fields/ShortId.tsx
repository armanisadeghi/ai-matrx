"use client";

/**
 * ShortId — a compact, table-friendly UUID display.
 *
 * A raw UUID makes table rows tall and noisy. This renders only the first 8
 * chars + "…" in a tiny mono chip, with the full value in the `title`. On
 * hover (group-hover) a small Copy button appears; clicking it copies the FULL
 * UUID to the clipboard and flips to a Check for ~1.5s. It must never make a
 * row taller than a single line of `text-xs`.
 */

import React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShortIdProps {
    value: string;
    className?: string;
}

/** Copy `text` to the clipboard, falling back to a hidden-textarea exec. */
async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall through to the legacy path below.
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

export const ShortId: React.FC<ShortIdProps> = ({ value, className }) => {
    const [copied, setCopied] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const onCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        void copyText(value).then((ok) => {
            if (!ok) return;
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
        });
    };

    const head = value.slice(0, 8);

    return (
        <span
            className={cn("group/shortid inline-flex items-center gap-1 align-middle", className)}
            title={value}
        >
            <span className="font-mono text-xs text-foreground">
                {head}
                <span className="text-muted-foreground">…</span>
            </span>
            <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? "Copied" : "Copy ID"}
                className={cn(
                    "inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none group-hover/shortid:opacity-100",
                    copied && "opacity-100",
                )}
            >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
        </span>
    );
};
