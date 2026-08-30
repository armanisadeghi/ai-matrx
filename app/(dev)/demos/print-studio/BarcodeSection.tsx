"use client";

/**
 * 1-D barcodes for retail and warehouse labels.
 * Entry: `@ai-matrx/print/barcode`.
 */

import { useEffect, useState } from "react";
import {
    DEFAULT_BARCODE_HEIGHT,
    DEFAULT_BARCODE_SCALE,
    generateBarcodeSvg,
    normalizeBarcodeValue,
    type BarcodeSymbology,
} from "@ai-matrx/print/barcode";
import { Field, SectionShell, StatusChip, controlClass, svgToImgSrc } from "./shared";

const SYMBOLOGIES: { id: BarcodeSymbology; label: string; hint: string; sample: string }[] = [
    {
        id: "code128",
        label: "Code 128",
        hint: "Printable ASCII, dense — the general-purpose warehouse workhorse.",
        sample: "MATRX-SN-88213",
    },
    {
        id: "ean13",
        label: "EAN-13",
        hint: "Retail GTIN. 12 digits get the GS1 mod-10 check digit appended; 13 get it verified.",
        sample: "400638133393",
    },
    {
        id: "upca",
        label: "UPC-A",
        hint: "Retail GTIN. 11 digits get the check digit appended; 12 get it verified.",
        sample: "03600029145",
    },
];

export function BarcodeSection() {
    const [symbology, setSymbology] = useState<BarcodeSymbology>("code128");
    const [value, setValue] = useState("MATRX-SN-88213");
    const [svg, setSvg] = useState("");
    const [renderError, setRenderError] = useState<string | null>(null);

    const active = SYMBOLOGIES.find((s) => s.id === symbology) ?? SYMBOLOGIES[0];

    // Normalization is pure — derive it during render rather than in an effect.
    let normalized: string | null = null;
    let normalizeError: string | null = null;
    try {
        normalized = normalizeBarcodeValue(value, symbology);
    } catch (err) {
        normalizeError = err instanceof Error ? err.message : "Invalid barcode value.";
    }
    const valid = normalized !== null;

    useEffect(() => {
        let cancelled = false;
        if (!valid) return;
        generateBarcodeSvg(value, symbology)
            .then((markup) => {
                if (cancelled) return;
                setSvg(markup);
                setRenderError(null);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setSvg("");
                setRenderError(err instanceof Error ? err.message : "Barcode generation failed.");
            });
        return () => {
            cancelled = true;
        };
    }, [value, symbology, valid]);

    const appended = normalized !== null && normalized !== value;
    const error = normalizeError ?? renderError;
    const shownSvg = valid ? svg : "";

    return (
        <SectionShell
            title="Barcodes"
            entry="@ai-matrx/print/barcode"
            blurb="Generation only, in the three symbologies the commerce lane actually prints. SVG works in Node and the browser."
        >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Symbology" hint={active.hint}>
                            <select
                                className={controlClass}
                                value={symbology}
                                onChange={(e) => {
                                    const next = e.target.value as BarcodeSymbology;
                                    setSymbology(next);
                                    setValue(SYMBOLOGIES.find((s) => s.id === next)?.sample ?? "");
                                }}
                            >
                                {SYMBOLOGIES.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Value">
                            <input className={controlClass} value={value} onChange={(e) => setValue(e.target.value)} />
                        </Field>
                    </div>

                    {error ? <StatusChip tone="warn">{error}</StatusChip> : null}
                    {!error && normalized !== null ? (
                        <StatusChip tone="ok">
                            {appended
                                ? `Check digit appended — encoding ${normalized}`
                                : `Value verified — encoding ${normalized}`}
                        </StatusChip>
                    ) : null}

                    <StatusChip tone="info">
                        Every generate call routes through <code className="font-mono">normalizeBarcodeValue</code>{" "}
                        first — there is no path that prints an unvalidated retail symbol. Bar height defaults to{" "}
                        {DEFAULT_BARCODE_HEIGHT[symbology]} mm at scale {DEFAULT_BARCODE_SCALE}, and the human-readable
                        line stays on because it is the fallback when a scan fails.
                    </StatusChip>
                </div>

                <div className="flex items-center justify-center rounded-md border border-border bg-white p-3">
                    {shownSvg ? (
                        <img src={svgToImgSrc(shownSvg)} alt="Barcode preview" className="max-h-32 w-full object-contain" />
                    ) : (
                        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                            No symbol
                        </div>
                    )}
                </div>
            </div>
        </SectionShell>
    );
}
