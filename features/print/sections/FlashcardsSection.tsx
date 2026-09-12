"use client";

/**
 * The flashcard deck printer, driven by the real options dialog.
 * Entries: `@ai-matrx/print/flashcards` + `PrintOptionsDialog` / `usePrintOptions`.
 */

import { Printer } from "lucide-react";
import { flashcardsPrinter } from "@ai-matrx/print/flashcards";
import { PrintOptionsDialog, usePrintOptions } from "@ai-matrx/print/react";
import { Button } from "@/components/ui/button";
import { SectionShell, StatusChip } from "./shared";
import { SAMPLE_DECK_TITLE, SAMPLE_FLASHCARDS } from "./sample-data";

export function FlashcardsSection() {
    const deck = { title: SAMPLE_DECK_TITLE, cards: SAMPLE_FLASHCARDS };
    const { open, setOpen, triggerPrint } = usePrintOptions(flashcardsPrinter, deck);

    return (
        <SectionShell
            title="Flashcards"
            entry="@ai-matrx/print/flashcards · @ai-matrx/print/react → PrintOptionsDialog"
            blurb="A bundled sample deck through the real options dialog — every variant and every setting the printer declares."
            actions={
                <Button size="sm" onClick={triggerPrint}>
                    <Printer className="mr-1 h-3.5 w-3.5" />
                    Print deck
                </Button>
            }
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                        {SAMPLE_DECK_TITLE} — {SAMPLE_FLASHCARDS.length} cards
                    </p>
                    <ol className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                        {SAMPLE_FLASHCARDS.map((card, index) => (
                            <li key={card.front} className="grid grid-cols-[1.5rem_1fr_1fr] gap-2 px-2 py-1.5">
                                <span className="text-muted-foreground">{index + 1}</span>
                                <span className="text-foreground">{card.front}</span>
                                <span className="text-muted-foreground">{card.back}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                        {flashcardsPrinter.variants.length} variants · {flashcardsPrinter.settings?.length ?? 0} settings
                    </p>
                    <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                        {flashcardsPrinter.variants.map((variant) => (
                            <li key={variant.id} className="px-2 py-1.5">
                                <span className="font-medium text-foreground">{variant.label}</span>
                                <code className="ml-1.5 font-mono text-[11px] text-muted-foreground">{variant.id}</code>
                                {variant.description ? (
                                    <p className="text-[11px] text-muted-foreground">{variant.description}</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                    <StatusChip tone="info" className="mt-2">
                        Duplex-mirrored variants column-swap the backs so long-edge duplex aligns perfectly; the stacked
                        variants print all fronts, then all backs. Show-through countermeasures (gray or mirrored back
                        text) are settings in the dialog.
                    </StatusChip>
                </div>
            </div>

            <PrintOptionsDialog printer={flashcardsPrinter} data={deck} open={open} onOpenChange={setOpen} />
        </SectionShell>
    );
}
