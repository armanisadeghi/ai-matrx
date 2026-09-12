"use client";

/**
 * The certificate / acknowledgment page, and the workbook composer that ends on
 * one. Entry: `@ai-matrx/print/certificate`.
 *
 * One primitive, two verticals: `formal` and `modern-minimal` are the course
 * faces, `acknowledgment` is the HR signature-page twin. Ornamentation is pure
 * CSS — a certificate must print identically from a print window with no
 * network.
 */

import { useState } from "react";
import { Award, BookCopy, Printer } from "lucide-react";
import {
    certificatePrinter,
    composeWorkbookPages,
    printWorkbook,
    type CertificateData,
    type CertificateVariant,
    type WorkbookSpec,
} from "@ai-matrx/print/certificate";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Field, SectionShell, StatusChip, announcePrintOutcome, controlClass } from "./shared";
import { SAMPLE_CERTIFICATE, SAMPLE_WORKBOOK_SECTIONS } from "./sample-data";

export function CertificateSection() {
    const [cert, setCert] = useState<CertificateData>(SAMPLE_CERTIFICATE);
    const [variant, setVariant] = useState<CertificateVariant>("formal");
    const [includeToc, setIncludeToc] = useState(true);
    const [endOnCertificate, setEndOnCertificate] = useState(true);
    const [busy, setBusy] = useState(false);

    const signatures = cert.signatures ?? [];

    const setSignature = (index: number, patch: { name?: string; role?: string }) => {
        setCert((prev) => ({
            ...prev,
            signatures: (prev.signatures ?? []).map((sig, i) => (i === index ? { ...sig, ...patch } : sig)),
        }));
    };

    const workbookSpec: WorkbookSpec = {
        title: "General Chemistry — Course Workbook",
        subtitle: "Units 1 and 2 · Summer 2026 cohort",
        sections: SAMPLE_WORKBOOK_SECTIONS,
        includeToc,
        ...(endOnCertificate ? { finalPage: { kind: "certificate" as const, data: cert } } : {}),
    };

    const composedPages = composeWorkbookPages(workbookSpec);

    const handlePrintCertificate = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const outcome = await certificatePrinter.print(cert, variant);
            announcePrintOutcome(outcome, "Certificate");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Certificate print failed");
        } finally {
            setBusy(false);
        }
    };

    const handlePrintWorkbook = (booklet: boolean) => {
        if (busy) return;
        setBusy(true);
        try {
            const outcome = printWorkbook(workbookSpec, { booklet });
            announcePrintOutcome(outcome, booklet ? "Workbook (booklet imposition)" : "Workbook (sequential)");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Workbook print failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SectionShell
            title="Certificate & workbook"
            entry="@ai-matrx/print/certificate"
            blurb="The certificate page — and its HR acknowledgment twin — plus the workbook composer that ends on one."
            actions={
                <Button size="sm" onClick={() => void handlePrintCertificate()} disabled={busy}>
                    <Award className="mr-1 h-3.5 w-3.5" />
                    Print certificate
                </Button>
            }
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-xs font-medium text-foreground">Certificate</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Recipient">
                            <input
                                className={controlClass}
                                value={cert.recipientName}
                                onChange={(e) => setCert((prev) => ({ ...prev, recipientName: e.target.value }))}
                            />
                        </Field>
                        <Field label="Date">
                            <input
                                className={controlClass}
                                value={cert.date ?? ""}
                                onChange={(e) => setCert((prev) => ({ ...prev, date: e.target.value }))}
                            />
                        </Field>
                        <Field label="Title" className="sm:col-span-2">
                            <input
                                className={controlClass}
                                value={cert.title}
                                onChange={(e) => setCert((prev) => ({ ...prev, title: e.target.value }))}
                            />
                        </Field>
                        <Field label="Subtitle" className="sm:col-span-2">
                            <input
                                className={controlClass}
                                value={cert.subtitle ?? ""}
                                onChange={(e) => setCert((prev) => ({ ...prev, subtitle: e.target.value }))}
                            />
                        </Field>
                        <Field label="Body" className="sm:col-span-2">
                            <input
                                className={controlClass}
                                value={cert.body ?? ""}
                                onChange={(e) => setCert((prev) => ({ ...prev, body: e.target.value }))}
                            />
                        </Field>
                    </div>

                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Signature lines
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            A signature with no name prints as a blank rule to sign by hand.
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                            {signatures.map((sig, index) => (
                                <div key={sig.role} className="grid gap-2 sm:grid-cols-2">
                                    <Field label={`Name ${index + 1}`}>
                                        <input
                                            className={controlClass}
                                            placeholder="(blank rule)"
                                            value={sig.name ?? ""}
                                            onChange={(e) => setSignature(index, { name: e.target.value })}
                                        />
                                    </Field>
                                    <Field label={`Role ${index + 1}`}>
                                        <input
                                            className={controlClass}
                                            value={sig.role}
                                            onChange={(e) => setSignature(index, { role: e.target.value })}
                                        />
                                    </Field>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Field label="Variant" hint={certificatePrinter.variants.find((v) => v.id === variant)?.description}>
                        <select
                            className={controlClass}
                            value={variant}
                            onChange={(e) => setVariant(e.target.value as CertificateVariant)}
                        >
                            {certificatePrinter.variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.label}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <StatusChip tone="info">
                        The three variants are ONE primitive on purpose: a course certificate and an HR
                        acknowledgment/signature page are the same printable unit wearing different words. Every border
                        and flourish is CSS — nothing here loads an image or a webfont.
                    </StatusChip>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-xs font-medium text-foreground">Workbook</p>
                    <div className="overflow-hidden rounded-md border border-border">
                        <p className="bg-muted/60 px-2 py-1 text-[11px] font-semibold text-foreground">
                            {workbookSpec.title}
                        </p>
                        <ul className="divide-y divide-border text-xs">
                            {SAMPLE_WORKBOOK_SECTIONS.map((section) => (
                                <li key={section.title} className="px-2 py-1.5">
                                    <span className="text-foreground">{section.title}</span>
                                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                                        {section.pagesHtml.length} content pages
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex flex-col gap-1.5 text-xs">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={includeToc}
                                onChange={(e) => setIncludeToc(e.target.checked)}
                            />
                            <span className="text-foreground">Include table of contents</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={endOnCertificate}
                                onChange={(e) => setEndOnCertificate(e.target.checked)}
                            />
                            <span className="text-foreground">End on the certificate above</span>
                        </label>
                    </div>

                    <StatusChip tone="info">
                        Composed to {composedPages.length} pages: cover
                        {includeToc ? " → contents" : ""} → each section&apos;s title page and content pages
                        {endOnCertificate ? " → certificate" : ""}. The TOC page numbers are computed from the same
                        layout the composer emits, so the TOC counting itself can&apos;t go off by one.
                    </StatusChip>

                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => handlePrintWorkbook(false)}>
                            <Printer className="mr-1 h-3.5 w-3.5" />
                            Print sequential
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => handlePrintWorkbook(true)}>
                            <BookCopy className="mr-1 h-3.5 w-3.5" />
                            Print as booklet
                        </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Two lanes, one composer: sequential prints one portrait page per composed fragment; booklet
                        hands the identical array to the saddle-stitch imposition in{" "}
                        <code className="font-mono">@ai-matrx/print/booklet</code> (2-up landscape — select short-edge
                        duplex).
                    </p>
                </div>
            </div>
        </SectionShell>
    );
}
