"use client";

/**
 * 1-D barcodes for retail and warehouse labels.
 * Entry: `@ai-matrx/print/barcode`.
 */

import { useEffect, useRef, useState } from "react";
import {
    DEFAULT_BARCODE_HEIGHT,
    DEFAULT_BARCODE_SCALE,
    generateBarcodeSvg,
    normalizeBarcodeValue,
    type BarcodeSymbology,
} from "@ai-matrx/print/barcode";
import { Field, SectionShell, StatusChip, controlClass, svgToImgSrc } from "@/features/print/components/shared";
import { ProInput } from "@/components/official/ProInput";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import {
    BARCODE_PREVIEW_SURFACE_NAME,
    barcodePreviewManifest,
    createBarcodePreviewScope,
} from "@/features/surfaces/manifests/barcode-preview.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// The generated source-attribution contract is being extended with `print`.
// Keep the runtime attribution canonical now without editing generated types.
const PRINT_SOURCE_FEATURE: SourceFeature = "print";
const LABELS = surfaceValueLabels(barcodePreviewManifest);

type BarcodeResultIdentity = {
    value: string;
    symbology: BarcodeSymbology;
};

type BarcodeRenderResult = BarcodeResultIdentity & {
    svg: string;
};

type BarcodeRenderError = BarcodeResultIdentity & {
    message: string;
};

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
    const [renderedResult, setRenderedResult] = useState<BarcodeRenderResult | null>(null);
    const [renderError, setRenderError] = useState<BarcodeRenderError | null>(null);
    const renderRequestId = useRef(0);

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
        const requestId = ++renderRequestId.current;
        const identity: BarcodeResultIdentity = { value, symbology };

        if (!valid) return;
        generateBarcodeSvg(value, symbology)
            .then((markup) => {
                if (cancelled || requestId !== renderRequestId.current) return;
                setRenderedResult({ ...identity, svg: markup });
                setRenderError(null);
            })
            .catch((err: unknown) => {
                if (cancelled || requestId !== renderRequestId.current) return;
                setRenderedResult(null);
                setRenderError({
                    ...identity,
                    message: err instanceof Error ? err.message : "Barcode generation failed.",
                });
            });
        return () => {
            cancelled = true;
        };
    }, [value, symbology, valid]);

    const appended = normalized !== null && normalized !== value;
    const hasMatchingResult =
        renderedResult?.value === value && renderedResult.symbology === symbology;
    const hasMatchingError = renderError?.value === value && renderError.symbology === symbology;
    const shownSvg = valid && hasMatchingResult ? renderedResult.svg : "";
    const matchingRenderError = hasMatchingError ? renderError.message : null;
    const error = normalizeError ?? matchingRenderError;
    const previewStatus = !valid ? "invalid" : matchingRenderError ? "failed" : shownSvg ? "ready" : "rendering";
    const getApplicationScope = () =>
        createBarcodePreviewScope({
            symbology,
            barcode_value: value,
            normalized_value: normalized ?? "",
            is_valid: valid,
            preview_status: previewStatus,
            render_error: matchingRenderError ?? "",
            preview_svg: shownSvg,
            content: normalized ?? value,
            context: {
                symbology,
                normalized_value: normalized ?? null,
                preview_status: previewStatus,
            },
        });

    return (
        <SurfaceRuntimeProvider surfaceName={BARCODE_PREVIEW_SURFACE_NAME} getScope={getApplicationScope}>
            <SectionShell
                title="Barcodes"
                entry="@ai-matrx/print/barcode"
                blurb="Generation only, in the three symbologies the commerce lane actually prints. SVG works in Node and the browser."
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="flex flex-col gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                        <div data-surface-value="symbology">
                            <Field label={LABELS.symbology} hint={active.hint}>
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
                        </div>
                        <EditableContextMenu
                            sourceFeature={PRINT_SOURCE_FEATURE}
                            surfaceName={BARCODE_PREVIEW_SURFACE_NAME}
                            menuVersion={2}
                            getApplicationScope={getApplicationScope}
                            onTextReplace={setValue}
                            onTextInsertBefore={(text) => setValue((current) => `${text}${current}`)}
                            onTextInsertAfter={(text) => setValue((current) => `${current}${text}`)}
                            contextData={{ content: value }}
                        >
                            <div data-surface-value="barcode_value">
                                <Field label={LABELS.barcode_value}>
                                    <ProInput
                                        type="text"
                                        value={value}
                                        onChange={(e) => setValue(e.target.value)}
                                        enableCleanup={false}
                                        enableVoice={false}
                                        className={controlClass}
                                    />
                                </Field>
                            </div>
                        </EditableContextMenu>
                        </div>

                        {error ? (
                            <div data-surface-value={matchingRenderError ? "render_error" : undefined}>
                                <StatusChip tone="warn">{error} <ErrorAlchemyMenu error={error} /></StatusChip>
                            </div>
                        ) : null}
                        {!error && normalized !== null ? (
                            <div data-surface-value="normalized_value">
                                <StatusChip tone="ok">
                                    {appended
                                        ? `Check digit appended — encoding ${normalized}`
                                        : `Value verified — encoding ${normalized}`}
                                </StatusChip>
                            </div>
                        ) : null}

                        <div data-surface-value="is_valid">
                            <StatusChip tone="info">
                                Every generate call routes through <code className="font-mono">normalizeBarcodeValue</code>{" "}
                                first — there is no path that prints an unvalidated retail symbol. Bar height defaults to{" "}
                                {DEFAULT_BARCODE_HEIGHT[symbology]} mm at scale {DEFAULT_BARCODE_SCALE}, and the human-readable
                                line stays on because it is the fallback when a scan fails.
                            </StatusChip>
                        </div>
                    </div>

                    <NonEditableContextMenu
                        sourceFeature={PRINT_SOURCE_FEATURE}
                        surfaceName={BARCODE_PREVIEW_SURFACE_NAME}
                        menuVersion={2}
                        getApplicationScope={getApplicationScope}
                        contextData={{ content: normalized ?? value }}
                    >
                        <div data-surface-value="preview_status" data-preview-status={previewStatus}>
                            <div data-surface-value="preview_svg" className="flex items-center justify-center rounded-md border border-border bg-white p-3">
                                {shownSvg ? (
                                    <img src={svgToImgSrc(shownSvg)} alt={LABELS.preview_svg} className="max-h-32 w-full object-contain" />
                                ) : (
                                    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                                        No symbol
                                    </div>
                                )}
                            </div>
                        </div>
                    </NonEditableContextMenu>
                </div>
            </SectionShell>
        </SurfaceRuntimeProvider>
    );
}
