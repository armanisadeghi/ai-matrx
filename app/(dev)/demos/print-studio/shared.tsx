"use client";

/**
 * Print Studio — shared presentational primitives.
 *
 * Deliberately tiny: every section on the studio page needs the same shell
 * (title + the npm entry it exercises + a dense body), the same status chip
 * vocabulary, and the same field wrapper. Nothing here knows anything about
 * printing.
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { PrintOutcome } from "@ai-matrx/print/core";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";

export type StudioTone = "ok" | "warn" | "info";

const TONE_CLASS: Record<StudioTone, string> = {
    ok: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    info: "border-border bg-muted text-muted-foreground",
};

const TONE_ICON: Record<StudioTone, typeof Info> = {
    ok: CheckCircle2,
    warn: AlertTriangle,
    info: Info,
};

export function StatusChip({
    tone,
    children,
    className,
}: {
    tone: StudioTone;
    children: ReactNode;
    className?: string;
}) {
    const Icon = TONE_ICON[tone];
    return (
        <span
            className={cn(
                "inline-flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs leading-snug",
                TONE_CLASS[tone],
                className,
            )}
        >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{children}</span>
        </span>
    );
}

export function SectionShell({
    title,
    entry,
    blurb,
    actions,
    children,
}: {
    title: string;
    entry: string;
    blurb: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="rounded-lg border border-border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
                    <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {entry}
                    </code>
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </header>
            <div className="p-4">{children}</div>
        </section>
    );
}

export function Field({
    label,
    hint,
    className,
    children,
}: {
    label: string;
    hint?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <label className={cn("flex min-w-0 flex-col gap-1", className)}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            {children}
            {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
        </label>
    );
}

export const controlClass =
    "h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The studio's ONE print-outcome announcement.
 *
 * Every printer in the package may resolve to a `PrintOutcome`: `"opened"` when
 * a print window went up, `"downloaded"` when the popup was blocked and the
 * document fell back to an `.html` file. That fallback must never be silent —
 * a user who never sees a print dialog otherwise has no idea a file landed in
 * their downloads folder.
 */
export function announcePrintOutcome(outcome: void | PrintOutcome, label: string): void {
    if (outcome === "downloaded") {
        toast.warning(`${label}: the print window was blocked, so it downloaded as an .html file instead — open it and print from there.`);
        return;
    }
    toast.success(`${label} sent to the print window.`);
}

/** An `<img>` source for locally generated SVG markup — avoids raw HTML injection. */
export function svgToImgSrc(svg: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Byte length of a payload — QR capacity math is measured in bytes, never characters. */
export function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}
