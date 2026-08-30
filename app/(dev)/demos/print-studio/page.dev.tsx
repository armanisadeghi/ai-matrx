"use client";

/**
 * PRINT STUDIO — one surface that exercises everything `@ai-matrx/print` can do.
 *
 * The package is the platform's entire print system, but most of its
 * capabilities had no UI anywhere. This is the feature-visibility surface for
 * it: a live section per capability, so any of it can be verified in one place
 * without wiring a product surface first.
 *
 * Sections map one-to-one onto the package's entries — /qr, /qr-styled,
 * /barcode, /labels (+ /react LabelSheetPreview), /flashcards (+ /react
 * PrintOptionsDialog), /booklet, and /pdf through the host seam at
 * `@ai-matrx/print/pdf` (converter + stylesheet included since 0.3.0).
 */

import { useState } from "react";
import { Barcode, BookOpen, FileText, Layers, Palette, Printer, QrCode } from "lucide-react";
import { cn } from "@/utils/cn";
import { BarcodeSection } from "./BarcodeSection";
import { BookletSection } from "./BookletSection";
import { FlashcardsSection } from "./FlashcardsSection";
import { LabelsSection } from "./LabelsSection";
import { MarkdownPdfSection } from "./MarkdownPdfSection";
import { QrSection } from "./QrSection";
import { StyledQrSection } from "./StyledQrSection";

const TABS = [
    { id: "qr", label: "QR", icon: QrCode },
    { id: "qr-styled", label: "Styled QR", icon: Palette },
    { id: "barcode", label: "Barcodes", icon: Barcode },
    { id: "labels", label: "Label sheets", icon: Layers },
    { id: "flashcards", label: "Flashcards", icon: Printer },
    { id: "booklet", label: "Booklet", icon: BookOpen },
    { id: "pdf", label: "Markdown → PDF", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PrintStudioPage() {
    const [tab, setTab] = useState<TabId>("qr");

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
            <header className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Printer className="h-4 w-4 text-muted-foreground" />
                    <h1 className="text-base font-semibold text-foreground">Print Studio</h1>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    Every capability on this page ships in the <code className="font-mono">@ai-matrx/print</code> npm
                    package — available to every Matrx app, package, and client.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    QR and barcode generation, styled brand codes, label sheets and roll stock with data-defined
                    formats, the flashcard deck printer, saddle-stitch booklet imposition, and markdown → PDF. Nothing
                    here is a mock: each section calls the published package.
                </p>
            </header>

            <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            tab === id
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                    </button>
                ))}
            </nav>

            {tab === "qr" ? <QrSection /> : null}
            {tab === "qr-styled" ? <StyledQrSection /> : null}
            {tab === "barcode" ? <BarcodeSection /> : null}
            {tab === "labels" ? <LabelsSection /> : null}
            {tab === "flashcards" ? <FlashcardsSection /> : null}
            {tab === "booklet" ? <BookletSection /> : null}
            {tab === "pdf" ? <MarkdownPdfSection /> : null}
        </div>
    );
}
