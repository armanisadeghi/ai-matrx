"use client";

/**
 * Saddle-stitch booklet imposition — the fold-and-staple capability.
 * Entry: `@ai-matrx/print/booklet`.
 */

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { bookletSizeWarning, imposeBooklet, printBooklet } from "@ai-matrx/print/booklet";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Field, SectionShell, StatusChip, controlClass } from "./shared";

const PAGE_STYLES = `
  .studio-page { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; font-family: Georgia, "Times New Roman", serif; }
  .studio-page h1 { font-size: 40pt; margin: 0 0 12pt; }
  .studio-page p { font-size: 11pt; color: #444; margin: 0; }
`;

function samplePages(count: number): string[] {
    return Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        return `<div class="studio-page"><h1>${n}</h1><p>Sample booklet page ${n} of ${count}</p></div>`;
    });
}

export function BookletSection() {
    const [pageCount, setPageCount] = useState(12);
    const safeCount = Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 1;

    const imposition = imposeBooklet(safeCount);
    const warning = bookletSizeWarning(safeCount);

    const handlePrint = () => {
        try {
            printBooklet(samplePages(safeCount), { title: `Sample booklet — ${safeCount} pages`, pageStyles: PAGE_STYLES });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Booklet print failed");
        }
    };

    return (
        <SectionShell
            title="Booklet imposition"
            entry="@ai-matrx/print/booklet"
            blurb="Turn a page run into fold-and-staple sheets. Pure arithmetic plus a 2-up landscape print lane."
            actions={
                <Button size="sm" onClick={handlePrint}>
                    <BookOpen className="mr-1 h-3.5 w-3.5" />
                    Print sample booklet
                </Button>
            }
        >
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div className="flex flex-col gap-3">
                    <Field label="Logical page count" hint="Padded up to the next multiple of 4">
                        <input
                            type="number"
                            min={1}
                            className={controlClass}
                            value={pageCount}
                            onChange={(e) => setPageCount(Number(e.target.value))}
                        />
                    </Field>
                    <StatusChip tone="info">
                        Padded to {imposition.paddedPageCount} pages across {imposition.sheets.length} sheet
                        {imposition.sheets.length === 1 ? "" : "s"}. Every spread&apos;s two page numbers sum to{" "}
                        {imposition.paddedPageCount + 1} — the invariant that makes the fold work.{" "}
                        <code className="font-mono">0</code> means a blank pad page.
                    </StatusChip>
                    {warning ? <StatusChip tone="warn">{warning}</StatusChip> : null}
                    {imposition.requiresShortEdgeDuplex ? (
                        <StatusChip tone="warn">
                            These spreads are 2-up landscape. Ordinary long-edge duplex lands the backs upside-down —
                            select short-edge (tumble) duplex. The print window banner says so too.
                        </StatusChip>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                        &ldquo;Print sample booklet&rdquo; generates {safeCount} numbered placeholder pages and opens a
                        print window; nothing is saved.
                    </p>
                </div>

                <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/60">
                            <tr>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Sheet</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Front (left, right)</th>
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Back (left, right)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {imposition.sheets.map((sheet, index) => (
                                <tr key={index} className="border-t border-border">
                                    <td className="px-2 py-1 text-muted-foreground">{index + 1}</td>
                                    <td className="px-2 py-1 font-mono text-foreground">
                                        {sheet.front[0]}, {sheet.front[1]}
                                    </td>
                                    <td className="px-2 py-1 font-mono text-foreground">
                                        {sheet.back[0]}, {sheet.back[1]}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </SectionShell>
    );
}
