"use client";

/**
 * Branded / styled QR generation — the clothing-tag lane.
 * Entry: `@ai-matrx/print/qr-styled`. Browser-only at call time.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImageUp, X } from "lucide-react";
import {
    DEFAULT_STYLED_QR_EC_LEVEL,
    MAX_STYLED_QR_LOGO_RATIO,
    generateStyledQrSvg,
    type StyledQrCornerStyle,
    type StyledQrDotStyle,
    type StyledQrEcLevel,
} from "@ai-matrx/print/qr-styled";
import { Button } from "@/components/ui/button";
import { Field, SectionShell, StatusChip, controlClass, svgToImgSrc } from "./shared";
import { SAMPLE_CODE, SAMPLE_ORIGIN } from "./sample-data";

const DOT_STYLES: StyledQrDotStyle[] = ["square", "dots", "rounded", "classy", "extra-rounded"];
const CORNER_STYLES: StyledQrCornerStyle[] = ["square", "dot", "extra-rounded"];
const EC_LEVELS: StyledQrEcLevel[] = ["Q", "H"];

export function StyledQrSection() {
    const [value, setValue] = useState(`${SAMPLE_ORIGIN}/l/${SAMPLE_CODE}`);
    const [dotStyle, setDotStyle] = useState<StyledQrDotStyle>("rounded");
    const [cornerStyle, setCornerStyle] = useState<StyledQrCornerStyle>("extra-rounded");
    const [color, setColor] = useState("#1d4ed8");
    const [backgroundColor, setBackgroundColor] = useState("#ffffff");
    const [ecLevel, setEcLevel] = useState<StyledQrEcLevel>(DEFAULT_STYLED_QR_EC_LEVEL);
    const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
    const [logoName, setLogoName] = useState<string | null>(null);
    const [svg, setSvg] = useState("");
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const hasValue = value.trim().length > 0;

    useEffect(() => {
        let cancelled = false;
        if (!hasValue) return;
        generateStyledQrSvg(value, {
            ecLevel,
            dotStyle,
            cornerStyle,
            color,
            backgroundColor,
            logoDataUrl: logoDataUrl ?? undefined,
        })
            .then((markup) => {
                if (cancelled) return;
                setSvg(markup);
                setError(null);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setSvg("");
                setError(err instanceof Error ? err.message : "Styled QR generation failed.");
            });
        return () => {
            cancelled = true;
        };
    }, [value, hasValue, ecLevel, dotStyle, cornerStyle, color, backgroundColor, logoDataUrl]);

    const shownSvg = hasValue ? svg : "";
    const shownError = hasValue ? error : "Enter a value to encode.";

    const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") {
                setLogoDataUrl(result);
                setLogoName(file.name);
            } else {
                setError("Could not read that file as a data URL.");
            }
        };
        reader.onerror = () => setError("Could not read that file.");
        reader.readAsDataURL(file);
    };

    return (
        <SectionShell
            title="Styled QR"
            entry="@ai-matrx/print/qr-styled"
            blurb="Brand mark in the middle, coloured modules. Browser-only; the plain lane stays the one for warehouse stock."
        >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex flex-col gap-3">
                    <Field label="Value to encode">
                        <input className={controlClass} value={value} onChange={(e) => setValue(e.target.value)} />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Dot style">
                            <select
                                className={controlClass}
                                value={dotStyle}
                                onChange={(e) => setDotStyle(e.target.value as StyledQrDotStyle)}
                            >
                                {DOT_STYLES.map((style) => (
                                    <option key={style} value={style}>
                                        {style}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Corner style">
                            <select
                                className={controlClass}
                                value={cornerStyle}
                                onChange={(e) => setCornerStyle(e.target.value as StyledQrCornerStyle)}
                            >
                                {CORNER_STYLES.map((style) => (
                                    <option key={style} value={style}>
                                        {style}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Module colour">
                            <input
                                type="color"
                                className={`${controlClass} p-1`}
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                            />
                        </Field>
                        <Field label="Background">
                            <input
                                type="color"
                                className={`${controlClass} p-1`}
                                value={backgroundColor}
                                onChange={(e) => setBackgroundColor(e.target.value)}
                            />
                        </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Error correction">
                            <select
                                className={controlClass}
                                value={ecLevel}
                                onChange={(e) => setEcLevel(e.target.value as StyledQrEcLevel)}
                            >
                                {EC_LEVELS.map((level) => (
                                    <option key={level} value={level}>
                                        {level}
                                        {level === DEFAULT_STYLED_QR_EC_LEVEL ? " (default)" : ""}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Centre logo" hint={logoName ?? "PNG or SVG, read as a data URL in the browser"}>
                            <div className="flex items-center gap-2">
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleLogo}
                                />
                                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                                    <ImageUp className="mr-1 h-3.5 w-3.5" />
                                    Choose file
                                </Button>
                                {logoDataUrl ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setLogoDataUrl(null);
                                            setLogoName(null);
                                        }}
                                    >
                                        <X className="mr-1 h-3.5 w-3.5" />
                                        Remove
                                    </Button>
                                ) : null}
                            </div>
                        </Field>
                    </div>
                    <StatusChip tone="info">
                        A centre logo occludes modules, so error correction is restricted to Q or H and defaults to H;
                        L/M are clamped up rather than refused. The logo must be a <code className="font-mono">data:</code>{" "}
                        URL — a print window is unauthenticated and a remote image taints the canvas. Logo size is capped
                        at {Math.round(MAX_STYLED_QR_LOGO_RATIO * 100)}% of the symbol.
                    </StatusChip>
                    {shownError ? <StatusChip tone="warn">{shownError}</StatusChip> : null}
                </div>

                <div className="flex items-start justify-center rounded-md border border-border bg-background p-3">
                    {shownSvg ? (
                        <img src={svgToImgSrc(shownSvg)} alt="Styled QR preview" className="h-48 w-48" />
                    ) : (
                        <div className="flex h-48 w-48 items-center justify-center text-xs text-muted-foreground">
                            No symbol
                        </div>
                    )}
                </div>
            </div>
        </SectionShell>
    );
}
