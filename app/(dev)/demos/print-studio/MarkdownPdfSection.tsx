"use client";

/**
 * Markdown → PDF through the host seam.
 * Entry: `@ai-matrx/print/pdf` via `@/lib/print/markdown-pdf` (the app supplies
 * the markdown→HTML converter and the stylesheet; no print logic lives here).
 */

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { SectionShell, StatusChip } from "./shared";
import { SAMPLE_MARKDOWN } from "./sample-data";

export function MarkdownPdfSection() {
    const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
    const [busy, setBusy] = useState(false);

    const handleDownload = async () => {
        if (busy || !markdown.trim()) return;
        setBusy(true);
        try {
            const { markdownToPdfBlob } = await import("@/lib/print/markdown-pdf");
            const blob = await markdownToPdfBlob(markdown);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "print-studio-report.pdf";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            toast.success("PDF downloaded");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "PDF generation failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SectionShell
            title="Markdown → PDF"
            entry="@ai-matrx/print/pdf via @/lib/print/markdown-pdf"
            blurb="html2canvas + jsPDF, lazy-loaded on use. The package brings the renderer; the app brings the converter and CSS."
            actions={
                <Button size="sm" onClick={handleDownload} disabled={busy || !markdown.trim()}>
                    {busy ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <FileDown className="mr-1 h-3.5 w-3.5" />
                    )}
                    Download PDF
                </Button>
            }
        >
            <textarea
                className="h-64 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                spellCheck={false}
            />
            <StatusChip tone="info" className="mt-3">
                Rendering rasterizes the page off-screen — it takes a few seconds on a long document and downloads a
                file when it finishes. The Tailwind v4 oklch/lab problem is handled inside the package by a scoped
                <code className="mx-1 font-mono">getComputedStyle</code> patch that is always restored.
            </StatusChip>
        </SectionShell>
    );
}
