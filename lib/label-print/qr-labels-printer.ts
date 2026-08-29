/**
 * qrLabelsPrinter — warehouse-grade QR label-sheet printing on standard
 * 8.5" × 11" label stock, built on the block-print system (BlockPrinter).
 *
 * ONE generic grid renderer driven by the LabelTemplate registry
 * (`label-templates.ts`) — geometry is data, never per-stock CSS.
 *
 * Fidelity rules (the reasons this exists):
 * - The print window is a fresh, unauthenticated document: every QR image is
 *   inlined as a data URI, never fetched.
 * - Spec-compliant quiet zone: the `qrcode` lib renders 4 modules of white
 *   margin INSIDE each data URI (its default; we pass it explicitly).
 * - `print-color-adjust: exact` on code cells so the browser never "helps".
 * - Modules are crisp: each QR is rasterized at 300 dpi for its printed size,
 *   and `image-rendering: pixelated` stops resampling blur.
 * - Captions auto-shrink to fit their box (FIT_TEXT pattern) — they never
 *   overflow onto the neighboring label.
 * - `startAtLabel` inserts LEADING blank cells so a partially-used sheet can
 *   be reused; trailing cells pad out the last page.
 *
 * Seam for the DB/batches lane: pass `{ labels, templateId }` as the printer
 * data (see QrLabelPrintData) to `qrLabelsPrinter.print(...)`, or call
 * `printCalibrationSheet(templateId)` / `downloadLabelsPdf(...)` (pdf lane in
 * `qr-labels-pdf.ts`). Docs: lib/label-print/FEATURE.md
 */

import {
  escapeHtml,
  openPrintWindow,
  type BlockPrinter,
  type PrintSettings,
} from "@/lib/block-print/block-print-utils";
import {
  LABEL_TEMPLATES,
  getLabelTemplate,
  type LabelTemplate,
} from "@/lib/label-print/label-templates";

// ─── Data contract ───────────────────────────────────────────────────────────

export interface QrLabel {
  /** The value encoded in the QR code (SKU, URL, id…). */
  qrValue: string;
  /** Bold headline under/next to the code. Defaults to qrValue when captions are on. */
  caption?: string;
  /** Additional small text lines (wide labels only — there is no room on tiny stock). */
  lines?: string[];
}

export interface QrLabelPrintData {
  labels: QrLabel[];
  /** Default template; the dialog's variant picker overrides it. */
  templateId: string;
  /** Optional custom-stock geometry used when templateId === "custom". */
  customTemplate?: LabelTemplate;
}

export type QrEcLevel = "L" | "M" | "Q";

export interface QrLabelSettings {
  startAtLabel: number; // 1-based first cell to print on
  copiesPerCode: number;
  showCaption: boolean;
  showLines: boolean;
  rangeFrom: number; // 1-based, 0 = no bound
  rangeTo: number;
  ecLevel: QrEcLevel;
  calibrationPage: boolean;
}

const DEFAULTS: QrLabelSettings = {
  startAtLabel: 1,
  copiesPerCode: 1,
  showCaption: true,
  showLines: true,
  rangeFrom: 0,
  rangeTo: 0,
  ecLevel: "M",
  calibrationPage: false,
};

function resolveSettings(s?: PrintSettings): QrLabelSettings {
  const num = (v: unknown, d: number, min = 0) =>
    typeof v === "number" && !Number.isNaN(v) ? Math.max(min, v) : d;
  const ec = s?.ecLevel;
  return {
    startAtLabel: num(s?.startAtLabel, DEFAULTS.startAtLabel, 1),
    copiesPerCode: num(s?.copiesPerCode, DEFAULTS.copiesPerCode, 1),
    showCaption: (s?.showCaption ?? DEFAULTS.showCaption) as boolean,
    showLines: (s?.showLines ?? DEFAULTS.showLines) as boolean,
    rangeFrom: num(s?.rangeFrom, 0),
    rangeTo: num(s?.rangeTo, 0),
    ecLevel: ec === "L" || ec === "Q" ? ec : "M",
    calibrationPage: (s?.calibrationPage ?? false) as boolean,
  };
}

// ─── QR generation (data URIs, inlined) ──────────────────────────────────────

const PRINT_DPI = 300;
/** Quiet zone: QR spec requires ≥4 modules of clear margin around the symbol. */
const QUIET_ZONE_MODULES = 4;

export async function generateQrDataUri(
  value: string,
  ecLevel: QrEcLevel,
  sizeInches: number,
): Promise<string> {
  // Deferred to call time (user click) — keeps `qrcode` out of shell graphs.
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: ecLevel,
    margin: QUIET_ZONE_MODULES,
    width: Math.round(sizeInches * PRINT_DPI),
    color: { dark: "#000000", light: "#ffffff" },
  });
}

// ─── Cell geometry ───────────────────────────────────────────────────────────

interface CellLayout {
  /** true = QR left, text right; false = QR on top, caption below. */
  wide: boolean;
  qrIn: number;
  padIn: number;
}

export function computeCellLayout(
  t: LabelTemplate,
  showCaption: boolean,
): CellLayout {
  const padIn = Math.min(0.08, t.labelHIn * 0.06);
  const wide = t.labelWIn / t.labelHIn >= 1.8;
  if (wide) {
    return { wide, qrIn: t.labelHIn - padIn * 2, padIn };
  }
  // Stacked. Round labels inscribe the content square inside the circle.
  const inset = t.round ? t.labelWIn * 0.15 : 0;
  const captionZone = showCaption ? Math.min(0.28, t.labelHIn * 0.16) : 0;
  const qrIn = Math.min(
    t.labelWIn - padIn * 2 - inset * 2,
    t.labelHIn - padIn * 2 - inset * 2 - captionZone,
  );
  return { wide, qrIn, padIn };
}

// ─── Generic grid renderer ───────────────────────────────────────────────────

function sheetStyles(t: LabelTemplate): string {
  const radius = t.round
    ? `${t.labelWIn / 2}in`
    : t.cornerRadiusIn
      ? `${t.cornerRadiusIn}in`
      : "0";
  return `
  @page { size: ${t.sheetWIn}in ${t.sheetHIn}in; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${t.sheetWIn}in; background: #fff; color: #000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }

  .lp-page {
    width: ${t.sheetWIn}in; height: ${t.sheetHIn}in;
    position: relative; overflow: hidden;
    page-break-after: always; break-after: page;
    border-bottom: 1px solid #e2e8f0; /* screen-only separator */
  }
  .lp-page:last-child { page-break-after: auto; break-after: auto; border-bottom: none; }

  .lp-cell {
    position: absolute;
    width: ${t.labelWIn}in; height: ${t.labelHIn}in;
    border-radius: ${radius};
    overflow: hidden;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .lp-qr {
    display: block;
    image-rendering: pixelated; /* no resampling blur on crisp modules */
  }
  .lp-cell-wide { display: flex; align-items: center; }
  .lp-cell-stacked { display: flex; flex-direction: column; align-items: center; justify-content: center; }

  .lp-text { flex: 1 1 auto; min-width: 0; overflow: hidden; align-self: stretch;
    display: flex; flex-direction: column; justify-content: center; }
  .lp-fit-wrap { overflow: hidden; }
  .lp-caption { font-weight: 700; line-height: 1.15; word-break: break-word; }
  .lp-line { line-height: 1.25; word-break: break-word; }
  .lp-caption-stacked { text-align: center; width: 100%; }

  /* Calibration */
  .lp-cal-cell { border: 0.5pt dashed #94a3b8; background: transparent; }
  .lp-cal-label { position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center; font-size: 7pt; color: #94a3b8; text-align: center; padding: 4px; }
  .lp-crop { position: absolute; background: #94a3b8;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  @media print {
    html, body { height: auto; overflow: visible; }
    .lp-page { border-bottom: none; }
    .screen-only { display: none !important; }
  }
`;
}

function cellPosition(t: LabelTemplate, index: number): { x: number; y: number } {
  const col = index % t.cols;
  const row = Math.floor(index / t.cols);
  return {
    x: t.marginLeftIn + col * (t.labelWIn + t.gutterXIn),
    y: t.marginTopIn + row * (t.labelHIn + t.gutterYIn),
  };
}

/** Caption auto-shrink — same pattern as the flashcards FIT_TEXT_SCRIPT. */
const LP_FIT_SCRIPT = `
<script>
(function () {
  function fit(el, box) {
    var size = parseFloat(window.getComputedStyle(el).fontSize);
    var min = 4;
    while (size > min && (el.scrollWidth > box.clientWidth + 1 || el.scrollHeight > box.clientHeight + 1)) {
      size -= 0.5;
      el.style.fontSize = size + "px";
    }
  }
  function run() {
    var els = document.querySelectorAll(".lp-fit-wrap .lp-fit");
    for (var i = 0; i < els.length; i++) fit(els[i], els[i].parentElement);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else setTimeout(run, 0);
})();
</script>`;

interface RenderedCell {
  html: string; // inner HTML of the cell, "" for a blank pad cell
}

function buildLabelCellHtml(
  label: QrLabel,
  qrDataUri: string,
  t: LabelTemplate,
  layout: CellLayout,
  s: QrLabelSettings,
): string {
  const qr = `<img class="lp-qr" src="${qrDataUri}" alt="" style="width:${layout.qrIn}in;height:${layout.qrIn}in;" />`;
  const captionText = s.showCaption ? (label.caption ?? label.qrValue) : "";

  if (layout.wide) {
    const lines =
      s.showLines && label.lines?.length
        ? label.lines
            .filter((l) => l.trim())
            .map(
              (l) =>
                `<div class="lp-line" style="font-size:8pt;">${escapeHtml(l)}</div>`,
            )
            .join("")
        : "";
    const caption = captionText
      ? `<div class="lp-fit-wrap" style="max-height:${(t.labelHIn * 0.3).toFixed(3)}in;"><div class="lp-fit lp-caption" style="font-size:12pt;">${escapeHtml(captionText)}</div></div>`
      : "";
    return `<div class="lp-cell-wide" style="height:100%;padding:${layout.padIn}in;gap:${layout.padIn}in;">
      ${qr}
      <div class="lp-text">${caption}${lines}</div>
    </div>`;
  }

  const caption = captionText
    ? `<div class="lp-fit-wrap lp-caption-stacked" style="height:${Math.min(0.28, t.labelHIn * 0.16).toFixed(3)}in;"><div class="lp-fit lp-caption" style="font-size:9pt;">${escapeHtml(captionText)}</div></div>`
    : "";
  return `<div class="lp-cell-stacked" style="height:100%;padding:${layout.padIn}in;">
    ${qr}
    ${caption}
  </div>`;
}

function renderPages(t: LabelTemplate, cells: RenderedCell[]): string {
  const perPage = t.cols * t.rows;
  const pages: string[] = [];
  for (let p = 0; p < Math.max(1, Math.ceil(cells.length / perPage)); p++) {
    const batch = cells.slice(p * perPage, (p + 1) * perPage);
    const cellHtml = batch
      .map((c, i) => {
        const { x, y } = cellPosition(t, i);
        return `<div class="lp-cell" style="left:${x}in;top:${y}in;">${c.html}</div>`;
      })
      .join("\n");
    pages.push(`<div class="lp-page">${cellHtml}</div>`);
  }
  return pages.join("\n");
}

function openSheetWindow(
  t: LabelTemplate,
  bodyHtml: string,
  title: string,
  withFitScript: boolean,
): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — ${escapeHtml(t.stockCode)}</title>
  <style>${sheetStyles(t)}</style>
</head>
<body>
<div class="screen-only" style="font-family:sans-serif;font-size:12px;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
  <button onclick="window.print()" style="padding:7px 18px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save PDF</button>
  <button onclick="window.close()" style="padding:7px 14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;">Close</button>
  <span style="color:#64748b;font-size:11px;">${escapeHtml(t.stockCode)} · ${escapeHtml(t.name)} · set printer to <strong>100% scale (no "fit to page"), no margins, Portrait</strong></span>
</div>
${bodyHtml}
${withFitScript ? LP_FIT_SCRIPT : ""}
</body>
</html>`;
  openPrintWindow(html, title);
}

// ─── Label selection (range → copies → startAt offset) ──────────────────────

export function expandLabels(labels: QrLabel[], s: QrLabelSettings): QrLabel[] {
  const from = s.rangeFrom > 0 ? s.rangeFrom : 1;
  const to = s.rangeTo > 0 ? Math.min(s.rangeTo, labels.length) : labels.length;
  const subset = labels.slice(from - 1, to);
  if (s.copiesPerCode <= 1) return subset;
  const out: QrLabel[] = [];
  for (const l of subset)
    for (let i = 0; i < s.copiesPerCode; i++) out.push(l);
  return out;
}

// ─── Calibration test page ───────────────────────────────────────────────────

function buildCalibrationBody(t: LabelTemplate): string {
  const perPage = t.cols * t.rows;
  const cells: string[] = [];
  for (let i = 0; i < perPage; i++) {
    const { x, y } = cellPosition(t, i);
    cells.push(
      `<div class="lp-cell lp-cal-cell" style="left:${x}in;top:${y}in;"><div class="lp-cal-label">${i + 1}</div></div>`,
    );
  }
  // Crop marks at the four corners of the label grid area
  const gridR = t.sheetWIn - t.marginLeftIn;
  const gridB = t.sheetHIn - t.marginTopIn;
  const mark = (x: number, y: number, h: boolean) =>
    `<div class="lp-crop" style="left:${x}in;top:${y}in;width:${h ? 0.25 : 0.0104}in;height:${h ? 0.0104 : 0.25}in;"></div>`;
  const marks = [
    mark(t.marginLeftIn - 0.25, t.marginTopIn, true),
    mark(t.marginLeftIn, t.marginTopIn - 0.25, false),
    mark(gridR, t.marginTopIn, true),
    mark(gridR - 0.0104, t.marginTopIn - 0.25, false),
    mark(t.marginLeftIn - 0.25, gridB - 0.0104, true),
    mark(t.marginLeftIn, gridB, false),
    mark(gridR, gridB - 0.0104, true),
    mark(gridR - 0.0104, gridB, false),
  ].join("");
  const banner = `<div style="position:absolute;left:0;right:0;top:${Math.max(0, t.marginTopIn - 0.3).toFixed(2)}in;text-align:center;font-size:7pt;color:#94a3b8;">Calibration — ${escapeHtml(t.stockCode)} · hold against your label sheet: every outline must sit on a label</div>`;
  return `<div class="lp-page">${banner}${marks}${cells.join("\n")}</div>`;
}

/** Print the grid outline + crop marks only — verify alignment before burning labels. */
export function printCalibrationSheet(template: LabelTemplate): void {
  openSheetWindow(
    template,
    buildCalibrationBody(template),
    "Label calibration",
    false,
  );
}

// ─── The printer ─────────────────────────────────────────────────────────────

function resolveTemplate(
  data: QrLabelPrintData,
  variantId?: string,
): LabelTemplate {
  if (variantId && variantId !== "custom") {
    const t = getLabelTemplate(variantId);
    if (t) return t;
  }
  if (data.templateId === "custom" && data.customTemplate)
    return data.customTemplate;
  return (
    getLabelTemplate(data.templateId) ??
    data.customTemplate ??
    LABEL_TEMPLATES[0]
  );
}

/** Core render path — also used by the demo page's direct print entry point. */
export async function printQrLabelSheet(
  data: QrLabelPrintData,
  variantId?: string,
  rawSettings?: PrintSettings,
): Promise<void> {
  const t = resolveTemplate(data, variantId);
  const s = resolveSettings(rawSettings);

  if (s.calibrationPage) {
    printCalibrationSheet(t);
    return;
  }

  const labels = expandLabels(data.labels ?? [], s);
  if (!labels.length) {
    openSheetWindow(
      t,
      `<div class="lp-page"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11pt;">No labels to print.</div></div>`,
      "QR labels",
      false,
    );
    return;
  }

  const layout = computeCellLayout(t, s.showCaption);

  // Generate every data URI up front (dedup identical values).
  const uriByValue = new Map<string, string>();
  for (const l of labels) {
    if (!uriByValue.has(l.qrValue)) {
      uriByValue.set(
        l.qrValue,
        await generateQrDataUri(l.qrValue, s.ecLevel, layout.qrIn),
      );
    }
  }

  // Leading blank cells for a partially-used sheet, then labels, then pad.
  const leadingBlanks = Math.max(0, s.startAtLabel - 1) % (t.cols * t.rows);
  const cells: RenderedCell[] = [
    ...Array.from({ length: leadingBlanks }, () => ({ html: "" })),
    ...labels.map((l) => ({
      html: buildLabelCellHtml(l, uriByValue.get(l.qrValue)!, t, layout, s),
    })),
  ];
  const perPage = t.cols * t.rows;
  const tail = cells.length % perPage;
  if (tail > 0)
    for (let i = 0; i < perPage - tail; i++) cells.push({ html: "" });

  openSheetWindow(t, renderPages(t, cells), "QR labels", true);
}

export const qrLabelsPrinter: BlockPrinter = {
  label: "Print QR label sheet",
  variants: LABEL_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.name,
    description: t.stockCode,
  })),
  settings: [
    {
      type: "number",
      id: "startAtLabel",
      label: "Start at label #",
      description: "Skip already-used positions on a partial sheet",
      defaultValue: 1,
      min: 1,
    },
    {
      type: "number",
      id: "copiesPerCode",
      label: "Copies per code",
      defaultValue: 1,
      min: 1,
      max: 999,
    },
    {
      type: "boolean",
      id: "showCaption",
      label: "Show caption",
      description: "Print the caption (or the code value) beside each QR",
      defaultValue: true,
    },
    {
      type: "boolean",
      id: "showLines",
      label: "Show detail lines",
      description: "Extra text lines on wide labels",
      defaultValue: true,
    },
    {
      type: "range",
      id: "labelRange",
      label: "Label range",
      description: "Print only labels N to M (blank = all)",
      fromId: "rangeFrom",
      toId: "rangeTo",
      defaultFrom: 0,
      defaultTo: 0,
    },
    {
      type: "select",
      id: "ecLevel",
      label: "Error correction",
      description: "Higher survives more damage; M is the warehouse default",
      options: [
        { value: "L", label: "L" },
        { value: "M", label: "M" },
        { value: "Q", label: "Q" },
      ],
      defaultValue: "M",
    },
    {
      type: "boolean",
      id: "calibrationPage",
      label: "Calibration test page",
      description: "Print outlines + crop marks only to verify alignment",
      defaultValue: false,
    },
  ],
  print: (data, variantId, settings) =>
    printQrLabelSheet(data as QrLabelPrintData, variantId, settings),
};
