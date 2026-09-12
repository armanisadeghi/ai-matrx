// features/print/admin/printAdminMap.ts
//
// Per-feature admin map for the Print hub (/print). Lists every route the
// feature owns, the components behind them, and the print surfaces that live
// in OTHER features but print through the same `@ai-matrx/print` package.
//
// Keep in sync as sections are added — the drift warnings on the rendered page
// flag anything under app/(core)/print not listed here. The product-facing
// list of printables is `features/print/hub/catalog.ts`, which is the ONE list
// the hub and the section header nav both read.

import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

export const printAdminMap: FeatureAdminMap = {
    name: "Print",
    slug: "print",
    baseUrl: "/print",
    description:
        "The platform's print hub: one index at /print of everything that can be put on paper, plus a page per printable. Every printer is the published @ai-matrx/print package — this feature owns no printing logic of its own, only the product surfaces around it. /print/order is the exception in kind: it calls the authenticated Lulu print-on-demand API on aidream and opens a REAL Stripe Checkout behind a live-money gate.",
    docs: [
        { label: "Print FEATURE.md", href: "/features/print/FEATURE.md" },
        { label: "Order flow notes", href: "/features/print/order/ORDER.md" },
        { label: "Block print system skill", href: "/.claude/skills/block-print-system/SKILL.md" },
    ],
    routeScanPath: "app/(core)/print",

    routes: [
        {
            url: "/print",
            label: "Print hub",
            description:
                "The index of every printable, grouped Education / Labels & codes / Documents / Order. Guests get the public Print landing at the same URL.",
            filePath: "app/(core)/print/page.tsx",
            status: "Live",
            notes: [
                "Tiles are generated from features/print/hub/catalog.ts",
                "Guest branch is server-side (module-landing-pages doctrine)",
            ],
        },
        {
            url: "/print/flashcards",
            label: "Flashcard decks",
            description: "The canonical flashcards printer, 10 variants, through the real options dialog.",
            filePath: "app/(core)/print/flashcards/page.tsx",
            status: "Live",
        },
        {
            url: "/print/education",
            label: "Cheat sheets, glossaries & study calendars",
            description: "The education artifact printers from @ai-matrx/print/education.",
            filePath: "app/(core)/print/education/page.tsx",
            status: "Live",
        },
        {
            url: "/print/exams",
            label: "Practice tests & bubble sheets",
            description:
                "Practice test, scannable bubble answer form, and answer key — deliberately three separate documents.",
            filePath: "app/(core)/print/exams/page.tsx",
            status: "Live",
        },
        {
            url: "/print/certificates",
            label: "Certificates & workbooks",
            description: "Completion certificates and workbooks composed from chosen sections.",
            filePath: "app/(core)/print/certificates/page.tsx",
            status: "Live",
        },
        {
            url: "/print/labels",
            label: "Label sheets & roll stock",
            description:
                "Avery templates and roll stock via the label template registry, plus the calibration sheet and the jsPDF download lane.",
            filePath: "app/(core)/print/labels/page.tsx",
            status: "Live",
        },
        {
            url: "/print/qr",
            label: "QR codes",
            description: "QR generation with live byte-capacity and error-correction maths.",
            filePath: "app/(core)/print/qr/page.tsx",
            status: "Live",
        },
        {
            url: "/print/branded-qr",
            label: "Branded QR codes",
            description: "Styled QR with brand colours and a centre logo, with the scan-margin cost stated.",
            filePath: "app/(core)/print/branded-qr/page.tsx",
            status: "Live",
        },
        {
            url: "/print/barcodes",
            label: "Barcodes",
            description: "Linear barcode symbologies rendered to scanner-legal widths.",
            filePath: "app/(core)/print/barcodes/page.tsx",
            status: "Live",
        },
        {
            url: "/print/zpl",
            label: "ZPL export",
            description: "Raw ZPL for Zebra-class thermal printers.",
            filePath: "app/(core)/print/zpl/page.tsx",
            status: "Live",
        },
        {
            url: "/print/documents",
            label: "Markdown to print or PDF",
            description:
                "The package's own markdown converter and stylesheet to a print window or a downloaded PDF blob.",
            filePath: "app/(core)/print/documents/page.tsx",
            status: "Live",
        },
        {
            url: "/print/booklet",
            label: "Booklet imposition",
            description: "Saddle-stitch page reordering.",
            filePath: "app/(core)/print/booklet/page.tsx",
            status: "Live",
        },
        {
            url: "/print/order",
            label: "Order printed copies",
            description:
                "Live print-on-demand calculator and paid order flow against the Lulu catalog on aidream. Opens a REAL Stripe Checkout.",
            filePath: "app/(core)/print/order/page.tsx",
            status: "Live",
            notes: [
                "LIVE-MONEY GATE: ordering stays shut until GET /lulu/payment-mode reports pairing_ok",
                "Auth-gated in app/(core)/print/order/layout.tsx — the rest of /print is not",
            ],
        },
        {
            url: "/print/admin",
            label: "This map",
            description: "The feature admin map.",
            filePath: "app/(core)/print/admin/page.tsx",
            status: "Live",
        },
    ],

    components: [
        {
            name: "PrintHub",
            filePath: "features/print/hub/PrintHub.tsx",
            description: "The grouped index of printables rendered at /print.",
            tier: "internal",
        },
        {
            name: "printCatalog",
            filePath: "features/print/hub/catalog.ts",
            description:
                "THE list of printables. Both the hub grid and the section header nav read it — there is no second list.",
            tier: "internal",
        },
        {
            name: "PrintSectionFrame",
            filePath: "features/print/components/PrintSectionFrame.tsx",
            description: "Body frame every /print/<section> page sits in: shell header injection + top offset.",
            tier: "internal",
        },
        {
            name: "PrintSectionHeader",
            filePath: "features/print/components/PrintSectionHeader.tsx",
            description: "The ONE shell header under /print: back chevron, section name, sibling dropdown.",
            tier: "internal",
        },
        {
            name: "PrintOrderWorkspace",
            filePath: "features/print/order/PrintOrderWorkspace.tsx",
            description: "The print-on-demand configurator: catalog constraint graph, live price, shipping, order flow.",
            tier: "internal",
        },
        {
            name: "orderingGate",
            filePath: "features/print/order/ordering-gate.ts",
            description:
                "The live-money gate. Reads GET /lulu/payment-mode and keeps Order & pay shut unless the backend names its mode and the pairing agrees. Do not simplify — see the file header.",
            tier: "internal",
        },
        {
            name: "PrintLanding",
            filePath: "features/auth/components/module-landing/landings/PrintLanding.tsx",
            description: "Public marketing landing served to guests at /print.",
            tier: "internal",
        },
    ],

    relatedFeatures: [
        {
            name: "Commerce intake — labels",
            adminUrl: "/commerce/admin",
            description:
                "Label batches (/commerce/labels) and printer certification (/commerce/labels/printers) are real product surfaces the hub links to rather than forking.",
        },
        {
            name: "Flashcards",
            adminUrl: "/education/flashcards/admin",
            description:
                "Set detail prints through the same flashcardsPrinter; its deck tools carry a 'More printing' door back to the hub.",
        },
        {
            name: "Rich document actions",
            description:
                "The registry's 'print' action is the canonical per-document Print entry (notes, chat messages, artifacts, scraper results).",
        },
        {
            name: "Markdown Studio",
            description: "Prints its buffer through the same printMarkdownContent wrapper.",
        },
    ],
};
