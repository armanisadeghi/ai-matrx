"use client";

/**
 * Raw ZPL II for Zebra-class thermal printers.
 * Entry: `@ai-matrx/print/zpl`.
 *
 * There is NO print button here, and that is not an omission: a browser cannot
 * send raw printer language to a printer. This lane generates the ZPL text; a
 * host delivers it (Zebra Browser Print, a raw TCP 9100 socket, a print
 * server). Copying it is the honest action, so copying is what the section
 * offers.
 */

import { useState } from "react";
import { Copy, Terminal } from "lucide-react";
import { LABEL_TEMPLATES, type LabelTemplate } from "@ai-matrx/print/labels";
import { DEFAULT_ZPL_DPI, assertZplScannable, labelsToZpl, type ZplDpi } from "@ai-matrx/print/zpl";
import { Button } from "@/components/ui/button";
import { useClipboard } from "@/hooks/useClipboard";
import { Field, SectionShell, StatusChip, byteLength, controlClass } from "./shared";
import { SAMPLE_ZPL_LABELS } from "./sample-data";

const ROLL_TEMPLATES: LabelTemplate[] = LABEL_TEMPLATES.filter((t) => t.kind === "roll");
const DPI_OPTIONS: ZplDpi[] = [203, 300];

export function ZplSection() {
    const [templateId, setTemplateId] = useState(ROLL_TEMPLATES[0]?.id ?? "");
    const [dpi, setDpi] = useState<ZplDpi>(DEFAULT_ZPL_DPI);
    const [qrValue, setQrValue] = useState(SAMPLE_ZPL_LABELS[0].qrValue);
    const [caption, setCaption] = useState(SAMPLE_ZPL_LABELS[0].caption ?? "");
    const [badge, setBadge] = useState(SAMPLE_ZPL_LABELS[0].badge ?? "");
    const [detail, setDetail] = useState((SAMPLE_ZPL_LABELS[0].lines ?? []).join(" | "));

    const { copyText } = useClipboard();

    const template = ROLL_TEMPLATES.find((t) => t.id === templateId) ?? ROLL_TEMPLATES[0];

    const labels = [
        {
            qrValue,
            caption: caption || undefined,
            badge: badge || undefined,
            lines: detail
                .split("|")
                .map((line) => line.trim())
                .filter(Boolean),
        },
    ];

    let zpl = "";
    let genError: string | null = null;
    try {
        zpl = labelsToZpl(template, labels, { dpi });
    } catch (err) {
        genError = err instanceof Error ? err.message : "ZPL generation failed.";
    }

    const verdict = assertZplScannable(template, byteLength(qrValue), { dpi });

    return (
        <SectionShell
            title="ZPL (raw thermal)"
            entry="@ai-matrx/print/zpl"
            blurb="Zebra printer language generated from the same geometry brain as the HTML label lane. Roll stock only."
            actions={
                <Button
                    size="sm"
                    variant="outline"
                    disabled={!zpl}
                    onClick={() => void copyText(zpl, "ZPL copied")}
                >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy ZPL
                </Button>
            }
        >
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-3">
                    <Field
                        label="Roll stock"
                        hint={
                            template
                                ? `${template.stockCode} — ${template.labelWIn}" × ${template.labelHIn}"`
                                : undefined
                        }
                    >
                        <select
                            className={controlClass}
                            value={templateId}
                            onChange={(e) => setTemplateId(e.target.value)}
                        >
                            {ROLL_TEMPLATES.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field
                        label="Printhead resolution"
                        hint={dpi === 203 ? "8 dots/mm — the ZD/GK/GX and Brother QL class" : "12 dots/mm — ZD621/ZT heads"}
                    >
                        <select
                            className={controlClass}
                            value={dpi}
                            onChange={(e) => setDpi(Number(e.target.value) as ZplDpi)}
                        >
                            {DPI_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option} dpi{option === DEFAULT_ZPL_DPI ? " (default)" : ""}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="QR value" hint={`${byteLength(qrValue)} bytes`}>
                        <input className={controlClass} value={qrValue} onChange={(e) => setQrValue(e.target.value)} />
                    </Field>
                    <Field label="Caption">
                        <input className={controlClass} value={caption} onChange={(e) => setCaption(e.target.value)} />
                    </Field>
                    <Field label="Badge" hint="One short, large token — a bin letter, a size, a department">
                        <input className={controlClass} value={badge} onChange={(e) => setBadge(e.target.value)} />
                    </Field>
                    <Field label="Detail lines" hint="Separate lines with |">
                        <input className={controlClass} value={detail} onChange={(e) => setDetail(e.target.value)} />
                    </Field>

                    <StatusChip tone={verdict.ok ? "ok" : "warn"}>
                        {verdict.ok
                            ? `Scannable — QR version ${verdict.version} at ${verdict.moduleSizeMm.toFixed(2)} mm per module, above the ${verdict.minModuleSizeMm} mm floor.`
                            : (verdict.message ?? "This payload will not scan reliably off this stock.")}
                    </StatusChip>
                    {genError ? <StatusChip tone="warn">{genError}</StatusChip> : null}
                </div>

                <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Generated ZPL</p>
                    <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                        {zpl || "—"}
                    </pre>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        This is raw printer language for Zebra-class thermal printers — not a document. A browser has no
                        way to send it to a printer, so there is deliberately no Print button here: copy it and deliver
                        it through Zebra Browser Print, a raw TCP 9100 socket, or a print server. Why bother:{" "}
                        <code className="font-mono">^BQ</code> tells the printer &ldquo;draw this symbol at exactly N
                        dots per module&rdquo;, so the modules are dot-aligned by construction instead of being
                        rasterized by a driver and re-sampled by the head — which is why a raw-ZPL label out-scans a
                        rasterized one at the dock door.
                    </p>
                    <StatusChip tone="info" className="mt-2">
                        Roll stock only — a 30-up Avery sheet is a laser-printer artifact with no ZPL equivalent, and
                        passing a sheet template throws with{" "}
                        <code className="font-mono">printQrLabelSheet</code> named as the fix. Every field is emitted
                        through <code className="font-mono">^CI28</code> UTF-8 with <code className="font-mono">^FH</code>{" "}
                        hex escaping, so a caret or a tilde in a caption can never become a command.
                    </StatusChip>
                </div>
            </div>
        </SectionShell>
    );
}
