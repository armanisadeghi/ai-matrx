"use client";

/**
 * LabelSheetPreview — scaled on-screen preview of one label sheet, driven by
 * the same LabelTemplate geometry as the printer (percent-positioned cells,
 * so it is exactly proportional at any width). Also renders a calibration
 * view (outlines only) so a user can eyeball the grid before printing.
 *
 * QR images are generated client-side to data URIs via `qrcode` (deferred
 * import at effect time). Docs: lib/label-print/FEATURE.md
 */

import React, { useEffect, useState } from "react";
import type { LabelTemplate } from "@/lib/label-print/label-templates";
import {
  computeCellLayout,
  generateQrDataUri,
  type QrEcLevel,
  type QrLabel,
} from "@/lib/label-print/qr-labels-printer";

interface LabelSheetPreviewProps {
  template: LabelTemplate;
  labels: QrLabel[];
  /** 1-based first cell to fill — leading cells render empty. */
  startAtLabel?: number;
  showCaption?: boolean;
  ecLevel?: QrEcLevel;
  /** Outlines-only calibration view. */
  calibration?: boolean;
  /** Which sheet to show (0-based). */
  pageIndex?: number;
  className?: string;
}

export function LabelSheetPreview({
  template: t,
  labels,
  startAtLabel = 1,
  showCaption = true,
  ecLevel = "M",
  calibration = false,
  pageIndex = 0,
  className,
}: LabelSheetPreviewProps) {
  const [uris, setUris] = useState<Map<string, string>>(new Map());

  const perPage = t.cols * t.rows;
  const leadingBlanks = Math.max(0, startAtLabel - 1) % perPage;
  const pageStart = pageIndex * perPage - leadingBlanks;
  const layout = computeCellLayout(t, showCaption);

  // Labels occupying this page's cells (null = blank cell)
  const cells: (QrLabel | null)[] = Array.from({ length: perPage }, (_, i) => {
    const li = pageStart + i;
    return li >= 0 && li < labels.length ? labels[li] : null;
  });

  const valuesKey = Array.from(
    new Set(
      cells.filter((c): c is QrLabel => c !== null).map((c) => c.qrValue),
    ),
  ).join("\u0000");
  const qrIn = layout.qrIn;

  useEffect(() => {
    if (calibration) return;
    let cancelled = false;
    const values = valuesKey ? valuesKey.split("\u0000") : [];
    (async () => {
      const next = new Map<string, string>();
      for (const v of values) {
        try {
          next.set(v, await generateQrDataUri(v, ecLevel, qrIn));
        } catch (err) {
          console.error("[LabelSheetPreview] QR generation failed:", err);
        }
      }
      if (!cancelled) setUris(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [calibration, ecLevel, qrIn, valuesKey]);

  const pct = (v: number, base: number) => `${(v / base) * 100}%`;
  const radiusPct = t.round
    ? "50%"
    : t.cornerRadiusIn
      ? `${(t.cornerRadiusIn / t.labelWIn) * 100}% / ${(t.cornerRadiusIn / t.labelHIn) * 100}%`
      : "0";

  return (
    <div
      className={`relative w-full bg-white border border-border rounded-md shadow-sm overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: `${t.sheetWIn} / ${t.sheetHIn}` }}
      aria-label={`Label sheet preview — ${t.stockCode}`}
    >
      {cells.map((label, i) => {
        const col = i % t.cols;
        const row = Math.floor(i / t.cols);
        const x = t.marginLeftIn + col * (t.labelWIn + t.gutterXIn);
        const y = t.marginTopIn + row * (t.labelHIn + t.gutterYIn);
        const uri = label ? uris.get(label.qrValue) : undefined;
        const wide = layout.wide;
        return (
          <div
            key={i}
            className={
              calibration || !label
                ? "absolute border border-dashed border-slate-300"
                : "absolute border border-slate-200"
            }
            style={{
              left: pct(x, t.sheetWIn),
              top: pct(y, t.sheetHIn),
              width: pct(t.labelWIn, t.sheetWIn),
              height: pct(t.labelHIn, t.sheetHIn),
              borderRadius: radiusPct,
              overflow: "hidden",
            }}
          >
            {calibration ? (
              <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-400">
                {i + 1}
              </div>
            ) : label ? (
              <div
                className={`w-full h-full flex ${wide ? "flex-row items-center" : "flex-col items-center justify-center"} gap-[2%] p-[3%]`}
              >
                {uri ? (
                  <img
                    src={uri}
                    alt=""
                    className="block"
                    style={
                      wide
                        ? { height: "88%", aspectRatio: "1" }
                        : {
                            width: `${(layout.qrIn / t.labelWIn) * 100}%`,
                            aspectRatio: "1",
                          }
                    }
                  />
                ) : (
                  <div
                    className="bg-slate-100 animate-pulse rounded-sm"
                    style={
                      wide
                        ? { height: "88%", aspectRatio: "1" }
                        : { width: "70%", aspectRatio: "1" }
                    }
                  />
                )}
                <div
                  className={`min-w-0 overflow-hidden text-black leading-tight ${wide ? "flex-1 text-left" : "text-center w-full"}`}
                  style={{ fontSize: "min(1.4vw, 10px)" }}
                >
                  {showCaption && (
                    <div className="font-bold truncate">
                      {label.caption ?? label.qrValue}
                    </div>
                  )}
                  {wide &&
                    label.lines
                      ?.filter((l) => l.trim())
                      .map((l, li) => (
                        <div key={li} className="truncate text-slate-600">
                          {l}
                        </div>
                      ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
