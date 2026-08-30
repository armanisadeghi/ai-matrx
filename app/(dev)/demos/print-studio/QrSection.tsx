"use client";

/**
 * Plain QR generation + the two payload builders the platform actually prints.
 * Entry: `@ai-matrx/print/qr`.
 */

import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import {
    DEFAULT_QR_EC_LEVEL,
    QR_MIN_QUIET_ZONE_MODULES,
    buildGs1DigitalLink,
    buildShortResolverUrl,
    generateQrSvg,
    minQrVersion,
    qrModuleCount,
    type QrEcLevel,
} from "@ai-matrx/print/qr";
import { Button } from "@/components/ui/button";
import { Field, SectionShell, StatusChip, byteLength, controlClass, svgToImgSrc } from "./shared";
import { SAMPLE_CODE, SAMPLE_GTIN, SAMPLE_ORIGIN } from "./sample-data";

const EC_LEVELS: QrEcLevel[] = ["L", "M", "Q", "H"];

const EC_DESCRIPTION: Record<QrEcLevel, string> = {
    L: "7% recovery — only right for a huge, clean, flat code",
    M: "15% recovery — the platform default",
    Q: "25% recovery",
    H: "30% recovery",
};

function describeSymbol(value: string, ecLevel: QrEcLevel): string {
    const bytes = byteLength(value);
    try {
        const version = minQrVersion(bytes, ecLevel);
        return `${bytes} bytes → version ${version}, ${qrModuleCount(version)}×${qrModuleCount(version)} modules`;
    } catch {
        return `${bytes} bytes — too large for any QR version at level ${ecLevel}`;
    }
}

export function QrSection() {
    const [value, setValue] = useState(`${SAMPLE_ORIGIN}/l/${SAMPLE_CODE}`);
    const [ecLevel, setEcLevel] = useState<QrEcLevel>(DEFAULT_QR_EC_LEVEL);
    const [svg, setSvg] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Resolver builder
    const [origin, setOrigin] = useState(SAMPLE_ORIGIN);
    const [code, setCode] = useState(SAMPLE_CODE);

    // GS1 builder
    const [gs1Origin, setGs1Origin] = useState("https://id.aimatrx.com");
    const [gtin, setGtin] = useState(SAMPLE_GTIN);
    const [lot, setLot] = useState("L42");
    const [serial, setSerial] = useState("S1001");
    const [expiry, setExpiry] = useState("271231");

    const hasValue = value.trim().length > 0;

    useEffect(() => {
        let cancelled = false;
        if (!hasValue) return;
        generateQrSvg(value, { ecLevel })
            .then((markup) => {
                if (cancelled) return;
                setSvg(markup);
                setError(null);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setSvg("");
                setError(err instanceof Error ? err.message : "QR generation failed.");
            });
        return () => {
            cancelled = true;
        };
    }, [value, hasValue, ecLevel]);

    const shownSvg = hasValue ? svg : "";
    const shownError = hasValue ? error : "Enter a value to encode.";

    let resolverUrl = "";
    let resolverError: string | null = null;
    try {
        resolverUrl = buildShortResolverUrl({ origin, code });
    } catch (err) {
        resolverError = err instanceof Error ? err.message : "Invalid resolver input.";
    }

    let gs1Url = "";
    let gs1Error: string | null = null;
    try {
        gs1Url = buildGs1DigitalLink({
            origin: gs1Origin,
            gtin,
            lot: lot || undefined,
            serial: serial || undefined,
            expiry: expiry || undefined,
        });
    } catch (err) {
        gs1Error = err instanceof Error ? err.message : "Invalid GS1 input.";
    }

    return (
        <SectionShell
            title="QR codes"
            entry="@ai-matrx/print/qr"
            blurb="Generation only — decoding lives elsewhere. Error correction defaults to M, never L."
        >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex flex-col gap-3">
                    <Field label="Value to encode">
                        <input
                            className={controlClass}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="https://aimatrx.com/l/a1B2c3"
                        />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Error correction" hint={EC_DESCRIPTION[ecLevel]}>
                            <select
                                className={controlClass}
                                value={ecLevel}
                                onChange={(e) => setEcLevel(e.target.value as QrEcLevel)}
                            >
                                {EC_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                        {level}
                                        {level === DEFAULT_QR_EC_LEVEL ? " (default)" : ""}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Symbol">
                            <p className="flex h-8 items-center text-xs text-muted-foreground">
                                {describeSymbol(value, ecLevel)}
                            </p>
                        </Field>
                    </div>
                    <StatusChip tone="info">
                        Quiet zone is clamped to at least {QR_MIN_QUIET_ZONE_MODULES} modules (ISO/IEC 18004 §6.3.8) no
                        matter what a caller passes — a tight quiet zone is the most common cause of a code that scans
                        on a monitor and fails at the dock door.
                    </StatusChip>
                    {shownError ? <StatusChip tone="warn">{shownError}</StatusChip> : null}
                </div>

                <div className="flex items-start justify-center rounded-md border border-border bg-background p-3">
                    {shownSvg ? (
                        <img src={svgToImgSrc(shownSvg)} alt="QR preview" className="h-48 w-48" />
                    ) : (
                        <div className="flex h-48 w-48 items-center justify-center text-xs text-muted-foreground">
                            No symbol
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                    <h3 className="text-xs font-semibold text-foreground">Short resolver URL</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        <code className="font-mono">buildShortResolverUrl</code> — the default e-commerce payload. The
                        code is an opaque input; identities are minted server-side.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Field label="Origin">
                            <input className={controlClass} value={origin} onChange={(e) => setOrigin(e.target.value)} />
                        </Field>
                        <Field label="Code">
                            <input className={controlClass} value={code} onChange={(e) => setCode(e.target.value)} />
                        </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {resolverError ? (
                            <StatusChip tone="warn">{resolverError}</StatusChip>
                        ) : (
                            <>
                                <code className="break-all rounded bg-muted px-1.5 py-1 font-mono text-[11px]">
                                    {resolverUrl}
                                </code>
                                <Button size="sm" variant="outline" onClick={() => setValue(resolverUrl)}>
                                    <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
                                    Encode this
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <div className="rounded-md border border-border p-3">
                    <h3 className="text-xs font-semibold text-foreground">GS1 Digital Link</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        <code className="font-mono">buildGs1DigitalLink</code> — what a retailer&apos;s scanner
                        understands without knowing anything about AI Matrx.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Field label="Origin">
                            <input
                                className={controlClass}
                                value={gs1Origin}
                                onChange={(e) => setGs1Origin(e.target.value)}
                            />
                        </Field>
                        <Field label="GTIN">
                            <input className={controlClass} value={gtin} onChange={(e) => setGtin(e.target.value)} />
                        </Field>
                        <Field label="Lot (optional)">
                            <input className={controlClass} value={lot} onChange={(e) => setLot(e.target.value)} />
                        </Field>
                        <Field label="Serial (optional)">
                            <input className={controlClass} value={serial} onChange={(e) => setSerial(e.target.value)} />
                        </Field>
                        <Field label="Expiry YYMMDD (optional)" className="sm:col-span-2">
                            <input className={controlClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                        </Field>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {gs1Error ? (
                            <StatusChip tone="warn">{gs1Error}</StatusChip>
                        ) : (
                            <>
                                <code className="break-all rounded bg-muted px-1.5 py-1 font-mono text-[11px]">
                                    {gs1Url}
                                </code>
                                <Button size="sm" variant="outline" onClick={() => setValue(gs1Url)}>
                                    <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
                                    Encode this
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </SectionShell>
    );
}
