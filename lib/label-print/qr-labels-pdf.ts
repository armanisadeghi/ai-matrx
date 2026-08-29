/**
 * PDF lane for QR label sheets — downloadLabelsPdf() renders the same
 * registry-driven grid as `qr-labels-printer.ts` straight into a jsPDF file,
 * for users who want a file instead of the browser print dialog.
 *
 * jspdf is imported dynamically INSIDE the function body (code-splitting
 * rule 6 — click-time machinery never rides a static edge). Supersedes the
 * deleted lib/qr-labels/LabelGenerator.tsx. Docs: lib/label-print/FEATURE.md
 */

import type { PrintSettings } from "@/lib/block-print/block-print-utils";
import {
  computeCellLayout,
  expandLabels,
  generateQrDataUri,
  type QrLabelPrintData,
  type QrLabelSettings,
} from "@/lib/label-print/qr-labels-printer";
import {
  LABEL_TEMPLATES,
  getLabelTemplate,
} from "@/lib/label-print/label-templates";

const PT_PER_IN = 72;

function resolvePdfSettings(s?: PrintSettings): QrLabelSettings {
  const num = (v: unknown, d: number, min = 0) =>
    typeof v === "number" && !Number.isNaN(v) ? Math.max(min, v) : d;
  const ec = s?.ecLevel;
  return {
    startAtLabel: num(s?.startAtLabel, 1, 1),
    copiesPerCode: num(s?.copiesPerCode, 1, 1),
    showCaption: (s?.showCaption ?? true) as boolean,
    showLines: (s?.showLines ?? true) as boolean,
    rangeFrom: num(s?.rangeFrom, 0),
    rangeTo: num(s?.rangeTo, 0),
    ecLevel: ec === "L" || ec === "Q" ? ec : "M",
    calibrationPage: false,
  };
}

/**
 * Generate a PDF of QR labels for the given template and hand it to the
 * browser as a download. Same data seam as the printer: `{ labels, templateId }`.
 */
export async function downloadLabelsPdf(
  data: QrLabelPrintData,
  templateId?: string,
  rawSettings?: PrintSettings,
  filename = "qr-labels.pdf",
): Promise<void> {
  const t =
    (templateId === "custom" || data.templateId === "custom"
      ? data.customTemplate
      : undefined) ??
    getLabelTemplate(templateId ?? data.templateId) ??
    LABEL_TEMPLATES[0];
  const s = resolvePdfSettings(rawSettings);
  const labels = expandLabels(data.labels ?? [], s);
  if (!labels.length) return;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: [t.sheetWIn * PT_PER_IN, t.sheetHIn * PT_PER_IN],
  });

  const layout = computeCellLayout(t, s.showCaption);
  const qrPt = layout.qrIn * PT_PER_IN;
  const padPt = layout.padIn * PT_PER_IN;
  const perPage = t.cols * t.rows;
  const leadingBlanks = Math.max(0, s.startAtLabel - 1) % perPage;

  const uriByValue = new Map<string, string>();
  for (const l of labels) {
    if (!uriByValue.has(l.qrValue)) {
      uriByValue.set(
        l.qrValue,
        await generateQrDataUri(l.qrValue, s.ecLevel, layout.qrIn),
      );
    }
  }

  for (let i = 0; i < labels.length; i++) {
    const cellIndex = i + leadingBlanks;
    if (cellIndex > 0 && cellIndex % perPage === 0) doc.addPage();
    const within = cellIndex % perPage;
    const col = within % t.cols;
    const row = Math.floor(within / t.cols);
    const x =
      (t.marginLeftIn + col * (t.labelWIn + t.gutterXIn)) * PT_PER_IN;
    const y = (t.marginTopIn + row * (t.labelHIn + t.gutterYIn)) * PT_PER_IN;
    const label = labels[i];
    const caption = s.showCaption ? (label.caption ?? label.qrValue) : "";

    if (layout.wide) {
      // QR left, text right
      const qrY = y + (t.labelHIn * PT_PER_IN - qrPt) / 2;
      doc.addImage(uriByValue.get(label.qrValue)!, "PNG", x + padPt, qrY, qrPt, qrPt);
      const textX = x + padPt + qrPt + padPt;
      const textMaxW = t.labelWIn * PT_PER_IN - (textX - x) - padPt;
      let cursorY = y + padPt + 12;
      if (caption) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(doc.splitTextToSize(caption, textMaxW)[0] ?? "", textX, cursorY);
        cursorY += 14;
      }
      if (s.showLines && label.lines?.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        for (const line of label.lines.filter((l) => l.trim())) {
          if (cursorY > y + t.labelHIn * PT_PER_IN - padPt) break;
          doc.text(doc.splitTextToSize(line, textMaxW)[0] ?? "", textX, cursorY);
          cursorY += 10;
        }
      }
    } else {
      // Stacked, centered
      const cx = x + t.labelWIn * PT_PER_IN / 2;
      const contentH = qrPt + (caption ? 12 : 0);
      const qrY = y + (t.labelHIn * PT_PER_IN - contentH) / 2;
      doc.addImage(
        uriByValue.get(label.qrValue)!,
        "PNG",
        cx - qrPt / 2,
        qrY,
        qrPt,
        qrPt,
      );
      if (caption) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const maxW = (t.labelWIn - layout.padIn * 2) * PT_PER_IN;
        doc.text(doc.splitTextToSize(caption, maxW)[0] ?? "", cx, qrY + qrPt + 10, {
          align: "center",
        });
      }
    }
  }

  doc.save(filename);
}
