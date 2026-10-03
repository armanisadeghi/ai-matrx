"use client";

/**
 * The PDF pages for `DocumentPrintPreview` in browsers that cannot show a PDF
 * inline (Chrome with "Download PDFs" on, Android, touch devices). There the
 * package's PDF frame paints only a file name and an Open button, so the
 * preview draws pages with the canonical `PdfDocumentRenderer` (pdf.js) and
 * prints by rasterising each page into a print-only frame.
 */

import dynamic from "next/dynamic";

const PdfDocumentRenderer = dynamic(() => import("@/features/pdf/components/viewer/PdfDocumentRenderer"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-xs text-muted-foreground">Laying out pages…</p>,
});

export function renderDocumentPdfPages(pdfUrl: string) {
  return <PdfDocumentRenderer blobUrl={pdfUrl} fileName="Document.pdf" />;
}

/** Print resolution for rasterised pages: 200 DPI against PDF's 72. */
const PRINT_SCALE = 200 / 72;

export async function printDocumentPdfPages(pdfUrl: string): Promise<void> {
  const { pdfjs } = await import("react-pdf");
  // The same-origin worker PdfDocumentRenderer uses (mirrored into /public by
  // scripts/copy-pdfjs-worker.ts). react-pdf defaults it to a bare
  // "pdf.worker.mjs" that does not resolve, so set it every time.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ url: pdfUrl });
  const pdf = await task.promise;
  const pageUrls: string[] = [];
  let pageSize = "";
  try {
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      if (n === 1) {
        const pt = page.getViewport({ scale: 1 });
        pageSize = `${pt.width}pt ${pt.height}pt`;
      }
      const viewport = page.getViewport({ scale: PRINT_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, intent: "print" }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error(`Page ${n} could not be drawn for printing.`);
      pageUrls.push(URL.createObjectURL(blob));
    }
  } finally {
    void task.destroy();
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const cleanup = () => {
    frame.remove();
    for (const url of pageUrls) URL.revokeObjectURL(url);
  };
  const win = frame.contentWindow;
  if (!win) {
    cleanup();
    throw new Error("Printing is blocked in this browser.");
  }
  win.document.open();
  win.document.write(
    `<!doctype html><html><head><title>Document</title><style>` +
      `@page{size:${pageSize};margin:0}html,body{margin:0;padding:0}` +
      `img{display:block;width:100%;height:auto;break-after:page}img:last-child{break-after:auto}` +
      `</style></head><body>${pageUrls.map((u) => `<img src="${u}" alt="">`).join("")}</body></html>`,
  );
  win.document.close();
  await Promise.all(
    Array.from(win.document.images, (img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => img.addEventListener("load", () => r(), { once: true })),
    ),
  );
  win.addEventListener("afterprint", () => setTimeout(cleanup, 0), { once: true });
  win.focus();
  win.print();
}
