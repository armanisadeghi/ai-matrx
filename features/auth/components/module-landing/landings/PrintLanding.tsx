// features/auth/components/module-landing/landings/PrintLanding.tsx
//
// Public marketing landing for the Print hub — served to guests at /print
// (signed-in visitors get the hub itself at the same URL).
//
// Every claim below is a page that exists today: the flashcard, study-aid,
// practice-test, certificate, label, QR, barcode, ZPL, document and booklet
// printers, and the print-on-demand order flow. Nothing here is a promise.

import {
    BookText,
    ClipboardCheck,
    FileText,
    GraduationCap,
    Layers,
    Printer,
    QrCode,
} from "lucide-react";
import {
    ModuleLanding,
    type ModuleCapability,
    type ModuleStep,
    type ModuleSubArea,
} from "../ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
    {
        icon: GraduationCap,
        title: "Everything a class needs on paper",
        description:
            "Flashcard decks cut apart cleanly, one-page cheat sheets, two-column glossaries, dated study calendars, and completion certificates — each laid out for the page, not screenshotted from a screen.",
    },
    {
        icon: ClipboardCheck,
        title: "Practice tests that can actually be graded",
        description:
            "A test, a scannable bubble answer form, and the answer key come out as three separate documents — because handing a student the key with the test is the mistake that surface exists to prevent.",
    },
    {
        icon: QrCode,
        title: "Labels and codes that scan the first time",
        description:
            "Avery sheets and continuous roll stock placed inch-exact, with a calibration page so you can prove your printer before you burn a sheet. QR and barcode symbols carry their real capacity and quiet-zone maths.",
    },
    {
        icon: Layers,
        title: "Your brand, without breaking the scan",
        description:
            "Branded QR codes take your colours and a logo in the middle, and still tell you honestly when a choice has eaten the error-correction budget a scanner needs.",
    },
    {
        icon: FileText,
        title: "Documents and booklets",
        description:
            "Written content prints as a styled document or downloads as a PDF. Booklet imposition reorders the pages so a folded stack reads in order on a saddle stitch.",
    },
    {
        icon: BookText,
        title: "Or have it printed and shipped",
        description:
            "Price a real book — trim, paper, binding, cover finish, quantity, destination — against a live print-on-demand catalogue, then order printed copies without leaving the page.",
    },
];

const STEPS: ModuleStep[] = [
    {
        number: "01",
        title: "Pick what you are printing",
        description:
            "The hub is one index of every printable: decks, study aids, tests, certificates, labels, codes, documents, booklets.",
    },
    {
        number: "02",
        title: "Set it up on its own page",
        description:
            "Each printable has real controls — sizes, variants, label stock, error-correction levels — with the consequences of each choice shown as you make it.",
    },
    {
        number: "03",
        title: "Print it, or have it printed",
        description:
            "Send it to your own printer, download it as a file, export raw ZPL to a thermal printer, or order bound copies shipped to you.",
    },
];

const SUB_AREAS: ModuleSubArea[] = [
    {
        title: "Education",
        status: "Live",
        href: "/print/flashcards",
        items: [
            "Flashcard decks, duplex-mirrored or stacked",
            "Cheat sheets, glossaries and study calendars",
            "Practice tests with scannable bubble sheets",
            "Certificates and composed workbooks",
        ],
    },
    {
        title: "Labels & codes",
        status: "Live",
        href: "/print/labels",
        items: [
            "Avery label sheets and continuous roll stock",
            "QR codes, branded QR codes and barcodes",
            "Raw ZPL for Zebra-class thermal printers",
            "Printer certification before you trust a run",
        ],
    },
    {
        title: "Documents & ordering",
        status: "Live",
        href: "/print/documents",
        items: [
            "Written content as a printed document or PDF",
            "Saddle-stitch booklet imposition",
            "Live print-on-demand pricing",
            "Order printed, bound, shipped copies",
        ],
    },
];

export default function PrintLanding() {
    return (
        <ModuleLanding
            surfaceId="landing:print"
            eyebrow="Print"
            eyebrowIcon={Printer}
            headline="Everything you can put"
            headlineGradient="on paper."
            description="One index of every printable this platform makes — flashcard decks, cheat sheets, practice tests with bubble sheets, certificates, label sheets, QR and barcodes, documents and booklets — plus a live calculator for having a real book printed, bound and shipped."
            primaryCtaHref="/sign-up?source=print-landing"
            primaryCtaLabel="Start Free"
            signInDestination="/print"
            workspaceHref="/print"
            workspaceLabel="Print hub"
            capabilitiesHeading="Print output built for the page, not screenshotted from a screen"
            capabilitiesDescription="Anything can be sent to a printer. Very little survives the trip. Each of these is laid out in real inches, for real stock, with the failure modes named before you waste a sheet."
            capabilities={CAPABILITIES}
            stepsDescription="Pick it, set it up, print it."
            steps={STEPS}
            subAreasHeading="What's inside"
            subAreasDescription="Four groups, every one of them a working page today."
            subAreas={SUB_AREAS}
            finalCtaHeading="Print something"
            finalCtaDescription="Open the hub and pick a printable — every page starts filled in, so you can send a real sheet to a real printer before you commit to anything."
            relatedModules={["/education", "/documents", "/notes"]}
        />
    );
}
