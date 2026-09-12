/**
 * THE PRINT CATALOG — the one list of everything this platform can put on paper.
 *
 * Both the hub grid at `/print` and every section page's header nav read from
 * here, so a capability cannot exist on one and be missing from the other.
 * Adding a printable means adding a row here; there is no second list.
 *
 * `href` may point outside `/print/*` (the commerce label batches and the
 * printer certification wizard are real product surfaces that already own
 * their routes — the hub links to them rather than forking them).
 */

import {
    Award,
    Barcode,
    BookOpen,
    BookText,
    ClipboardCheck,
    FileText,
    GraduationCap,
    Layers,
    type LucideIcon,
    Palette,
    Printer,
    QrCode,
    ShoppingCart,
    Stamp,
    Terminal,
} from "lucide-react";

export type PrintGroupId = "education" | "codes" | "documents" | "order";

export interface PrintCatalogEntry {
    /** Stable id. For a `/print/<slug>` page this IS the slug. */
    id: string;
    label: string;
    /** One plain sentence: what comes out of the printer. */
    blurb: string;
    href: string;
    icon: LucideIcon;
    group: PrintGroupId;
    /** True when the destination is a product surface outside `/print/*`. */
    elsewhere?: boolean;
}

export interface PrintGroup {
    id: PrintGroupId;
    label: string;
    description: string;
    icon: LucideIcon;
}

export const PRINT_GROUPS: PrintGroup[] = [
    {
        id: "education",
        label: "Education",
        description:
            "Everything a teacher, tutor, or student hands out on paper — decks, study aids, tests, and certificates.",
        icon: GraduationCap,
    },
    {
        id: "codes",
        label: "Labels & codes",
        description:
            "Scannable output: label sheets and roll stock, QR and barcode symbols, and raw ZPL for thermal printers.",
        icon: QrCode,
    },
    {
        id: "documents",
        label: "Documents",
        description: "Long-form writing turned into a printed document or a bound booklet.",
        icon: FileText,
    },
    {
        id: "order",
        label: "Order printed copies",
        description:
            "Have it printed, bound, and shipped by a print-on-demand press instead of printing it yourself.",
        icon: ShoppingCart,
    },
];

export const PRINT_CATALOG: PrintCatalogEntry[] = [
    // ── Education ──────────────────────────────────────────────────────────
    {
        id: "flashcards",
        label: "Flashcard decks",
        blurb: "A deck as cut-apart cards — duplex-mirrored or stacked, with show-through countermeasures.",
        href: "/print/flashcards",
        icon: Printer,
        group: "education",
    },
    {
        id: "education",
        label: "Cheat sheets, glossaries & study calendars",
        blurb: "A one-page formula sheet, a two-column glossary, or a dated study calendar.",
        href: "/print/education",
        icon: GraduationCap,
        group: "education",
    },
    {
        id: "exams",
        label: "Practice tests & bubble sheets",
        blurb: "A practice test, its scannable bubble answer form, and the answer key — three separate documents.",
        href: "/print/exams",
        icon: ClipboardCheck,
        group: "education",
    },
    {
        id: "certificates",
        label: "Certificates & workbooks",
        blurb: "A completion certificate, and a workbook composed from sections you choose.",
        href: "/print/certificates",
        icon: Award,
        group: "education",
    },
    {
        id: "decks",
        label: "Your flashcard sets",
        blurb: "Open a set you already have and print it straight from its page.",
        href: "/education/flashcards",
        icon: Layers,
        group: "education",
        elsewhere: true,
    },

    // ── Labels & codes ─────────────────────────────────────────────────────
    {
        id: "labels",
        label: "Label sheets & roll stock",
        blurb: "Avery sheets and continuous roll labels, laid out inch-exact with a calibration page.",
        href: "/print/labels",
        icon: Layers,
        group: "codes",
    },
    {
        id: "qr",
        label: "QR codes",
        blurb: "A QR symbol at a chosen size and error-correction level, with the capacity math shown.",
        href: "/print/qr",
        icon: QrCode,
        group: "codes",
    },
    {
        id: "branded-qr",
        label: "Branded QR codes",
        blurb: "The same symbol in your colours, with a logo in the middle and the scan margin still honest.",
        href: "/print/branded-qr",
        icon: Palette,
        group: "codes",
    },
    {
        id: "barcodes",
        label: "Barcodes",
        blurb: "Code 128, EAN, UPC and friends, rendered to the widths a scanner expects.",
        href: "/print/barcodes",
        icon: Barcode,
        group: "codes",
    },
    {
        id: "zpl",
        label: "ZPL export",
        blurb: "Raw ZPL for a Zebra-class thermal printer, for when the browser print dialog is not the path.",
        href: "/print/zpl",
        icon: Terminal,
        group: "codes",
    },
    {
        id: "label-batches",
        label: "Label batches",
        blurb: "The label batches you have created, with their identifiers and print history.",
        href: "/commerce/labels",
        icon: Stamp,
        group: "codes",
        elsewhere: true,
    },
    {
        id: "printer-certification",
        label: "Printer certification",
        blurb: "Prove a physical printer reproduces a scannable label before you trust a run to it.",
        href: "/commerce/labels/printers",
        icon: Printer,
        group: "codes",
        elsewhere: true,
    },

    // ── Documents ──────────────────────────────────────────────────────────
    {
        id: "documents",
        label: "Markdown to print or PDF",
        blurb: "Written content as a styled printed document or a downloaded PDF.",
        href: "/print/documents",
        icon: FileText,
        group: "documents",
    },
    {
        id: "booklet",
        label: "Booklet imposition",
        blurb: "Pages reordered for saddle-stitch: fold the stack in half and it reads in order.",
        href: "/print/booklet",
        icon: BookOpen,
        group: "documents",
    },

    // ── Order printed copies ───────────────────────────────────────────────
    {
        id: "order",
        label: "Order a printed book",
        blurb: "Price a real book — trim, paper, binding, cover, shipping — then order printed copies.",
        href: "/print/order",
        icon: BookText,
        group: "order",
    },
];

/** The `/print/<slug>` pages, in hub order — the section header nav reads this. */
export const PRINT_SECTIONS = PRINT_CATALOG.filter((entry) => !entry.elsewhere && entry.id !== "order");

export function printEntry(id: string): PrintCatalogEntry | undefined {
    return PRINT_CATALOG.find((entry) => entry.id === id);
}

export function printEntriesInGroup(group: PrintGroupId): PrintCatalogEntry[] {
    return PRINT_CATALOG.filter((entry) => entry.group === group);
}
