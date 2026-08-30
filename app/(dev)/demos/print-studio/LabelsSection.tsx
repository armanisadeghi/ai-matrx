"use client";

/**
 * Label sheets, roll stock and data-defined label formats.
 * Entries: `@ai-matrx/print/labels` + `LabelSheetPreview` from `@ai-matrx/print/react`.
 */

import { useState } from "react";
import { Crosshair, FileDown, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import {
    LABEL_FORMAT_PRESETS,
    LABEL_TEMPLATES,
    applyLabelFormat,
    assertScannable,
    getLabelTemplate,
    printCalibrationSheet,
    type LabelFormat,
    type QrEcLevel,
} from "@ai-matrx/print/labels";
import { LabelSheetPreview } from "@ai-matrx/print/react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Field, SectionShell, StatusChip, byteLength, controlClass } from "./shared";
import { SAMPLE_FORMAT_ROWS } from "./sample-data";

const EC_LEVELS: QrEcLevel[] = ["L", "M", "Q"];

/** The row keys a format actually reads — literals contribute nothing to the table. */
function formatFields(format: LabelFormat): string[] {
    const fields: string[] = [];
    for (const element of format.elements) {
        if ("field" in element.source && !fields.includes(element.source.field)) {
            fields.push(element.source.field);
        }
    }
    return fields;
}

function initialRows(): Record<string, Record<string, string>[]> {
    return Object.fromEntries(
        LABEL_FORMAT_PRESETS.map((preset) => [preset.id, (SAMPLE_FORMAT_ROWS[preset.id] ?? []).map((r) => ({ ...r }))]),
    );
}

export function LabelsSection() {
    const [templateId, setTemplateId] = useState("avery-5160");
    const [formatId, setFormatId] = useState("garment");
    const [rowsByFormat, setRowsByFormat] = useState<Record<string, Record<string, string>[]>>(initialRows);
    const [ecLevel, setEcLevel] = useState<QrEcLevel>("M");
    const [startAtLabel, setStartAtLabel] = useState(1);
    const [calibration, setCalibration] = useState(false);
    const [busy, setBusy] = useState<"print" | "pdf" | null>(null);

    const template = getLabelTemplate(templateId) ?? LABEL_TEMPLATES[0];
    const format = LABEL_FORMAT_PRESETS.find((f) => f.id === formatId) ?? LABEL_FORMAT_PRESETS[0];
    const fields = formatFields(format);
    const rows = rowsByFormat[format.id] ?? [];

    const { labels } = applyLabelFormat(format, rows);
    const longestPayload = labels.reduce((max, label) => Math.max(max, byteLength(label.qrValue)), 0);
    const scan = labels.length ? assertScannable(template, longestPayload, ecLevel) : null;

    const setRow = (index: number, key: string, value: string) => {
        setRowsByFormat((prev) => {
            const next = [...(prev[format.id] ?? [])];
            next[index] = { ...next[index], [key]: value };
            return { ...prev, [format.id]: next };
        });
    };

    const addRow = () => {
        setRowsByFormat((prev) => ({
            ...prev,
            [format.id]: [...(prev[format.id] ?? []), Object.fromEntries(fields.map((f) => [f, ""]))],
        }));
    };

    const removeRow = (index: number) => {
        setRowsByFormat((prev) => ({
            ...prev,
            [format.id]: (prev[format.id] ?? []).filter((_, i) => i !== index),
        }));
    };

    const handlePrint = async () => {
        if (!labels.length || busy) return;
        setBusy("print");
        try {
            const { printQrLabelSheet } = await import("@ai-matrx/print/labels");
            await printQrLabelSheet({ labels, templateId }, undefined, { ecLevel, startAtLabel });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Print failed");
        } finally {
            setBusy(null);
        }
    };

    const handlePdf = async () => {
        if (!labels.length || busy) return;
        setBusy("pdf");
        try {
            const { downloadLabelsPdf } = await import("@ai-matrx/print/labels");
            await downloadLabelsPdf({ labels, templateId }, templateId, { ecLevel, startAtLabel }, "print-studio-labels");
            toast.success("Label PDF downloaded");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "PDF generation failed");
        } finally {
            setBusy(null);
        }
    };

    return (
        <SectionShell
            title="Label sheets"
            entry="@ai-matrx/print/labels · @ai-matrx/print/react → LabelSheetPreview"
            blurb="One data shape, three lanes: print window, PDF download, calibration page. Avery sheets and roll stock."
            actions={
                <>
                    <Button size="sm" onClick={handlePrint} disabled={!labels.length || busy !== null}>
                        {busy === "print" ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Printer className="mr-1 h-3.5 w-3.5" />
                        )}
                        Print sheet
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printCalibrationSheet(template)}>
                        <Crosshair className="mr-1 h-3.5 w-3.5" />
                        Calibration page
                    </Button>
                    <Button size="sm" variant="outline" onClick={handlePdf} disabled={!labels.length || busy !== null}>
                        {busy === "pdf" ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <FileDown className="mr-1 h-3.5 w-3.5" />
                        )}
                        Download PDF
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Label stock" className="sm:col-span-2">
                            <select
                                className={controlClass}
                                value={templateId}
                                onChange={(e) => setTemplateId(e.target.value)}
                            >
                                {LABEL_TEMPLATES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.stockCode} — {t.name}
                                        {t.kind === "roll" ? " (roll)" : ""}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Label format">
                            <select className={controlClass} value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                                {LABEL_FORMAT_PRESETS.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Error correction">
                            <select
                                className={controlClass}
                                value={ecLevel}
                                onChange={(e) => setEcLevel(e.target.value as QrEcLevel)}
                            >
                                {EC_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                        {level}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Start at label" hint="Reuse a partially-used sheet">
                            <input
                                type="number"
                                min={1}
                                max={template.cols * template.rows}
                                className={controlClass}
                                value={startAtLabel}
                                onChange={(e) => setStartAtLabel(Math.max(1, Number(e.target.value) || 1))}
                            />
                        </Field>
                        <Field label="Preview mode">
                            <select
                                className={controlClass}
                                value={calibration ? "calibration" : "labels"}
                                onChange={(e) => setCalibration(e.target.value === "calibration")}
                            >
                                <option value="labels">Labels</option>
                                <option value="calibration">Calibration outline</option>
                            </select>
                        </Field>
                    </div>

                    <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/60">
                                <tr>
                                    <th className="w-8 px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                                    {fields.map((field) => (
                                        <th key={field} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                                            {field}
                                        </th>
                                    ))}
                                    <th className="w-8 px-2 py-1.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, index) => (
                                    <tr key={index} className="border-t border-border">
                                        <td className="px-2 py-1 text-muted-foreground">{index + 1}</td>
                                        {fields.map((field) => (
                                            <td key={field} className="px-1 py-1">
                                                <input
                                                    className="h-7 w-full min-w-28 rounded border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                    value={row[field] ?? ""}
                                                    onChange={(e) => setRow(index, field, e.target.value)}
                                                />
                                            </td>
                                        ))}
                                        <td className="px-1 py-1">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6"
                                                onClick={() => removeRow(index)}
                                                aria-label={`Remove row ${index + 1}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 ? (
                                    <tr className="border-t border-border">
                                        <td colSpan={fields.length + 2} className="px-2 py-3 text-muted-foreground">
                                            No rows — add one to see the sheet.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={addRow}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add row
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            {labels.length} label{labels.length === 1 ? "" : "s"} · {template.cols * template.rows} per{" "}
                            {template.kind === "roll" ? "roll page" : "sheet"} · longest payload {longestPayload} bytes
                        </span>
                    </div>

                    {scan ? (
                        <StatusChip tone={scan.ok ? "ok" : "warn"}>
                            {scan.message ??
                                `Scannable — version ${scan.version}, ${scan.moduleSizeMm.toFixed(2)} mm modules (floor ${scan.minModuleSizeMm} mm).`}
                        </StatusChip>
                    ) : null}

                    <StatusChip tone="info">
                        <code className="font-mono">applyLabelFormat</code> turns these rows into label data using the
                        selected format&apos;s ordered elements, so a client can define its own layout as data. Print at
                        100% scale with no margins; run the calibration page once per stock change.
                    </StatusChip>
                </div>

                <div className="rounded-md border border-border bg-background p-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Sheet preview
                    </p>
                    <LabelSheetPreview
                        template={template}
                        labels={labels}
                        startAtLabel={startAtLabel}
                        showCaption
                        ecLevel={ecLevel}
                        calibration={calibration}
                    />
                </div>
            </div>
        </SectionShell>
    );
}
