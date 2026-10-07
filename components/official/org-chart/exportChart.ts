// components/official/org-chart/exportChart.ts
//
// Download the WHOLE chart — not the part in view — as PNG (lossless, to keep)
// or PDF (compressed, to send). The world layer is rendered at its real size
// with the pan/zoom transform removed, so every card is in the file however the
// chart is panned. A caption with the chart's name and the date is drawn onto
// the image itself: a picture of an organization outlives the screen it was
// taken from, and a filename does not survive being pasted into a deck.

export type ChartExportFormat = "png" | "pdf";

function fileName(title: string, ext: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org-chart";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function save(blob: Blob, name: string) {
  downloadFile(name, blob, blob.type);
}

export async function exportChart(
  world: HTMLElement,
  size: { width: number; height: number },
  opts: { title: string; format: ChartExportFormat },
): Promise<void> {
  const { toCanvas } = await import("html-to-image");
  const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const pad = 32;
  const chart = await toCanvas(world, {
    width: size.width + pad * 2,
    height: size.height + pad * 2,
    pixelRatio: 2,
    backgroundColor: background,
    style: { transform: `translate(${pad}px, ${pad}px)`, transition: "none" },
    // The hover "+" and action bars are controls, not the organization.
    filter: (n) => !(n instanceof HTMLElement && (n.dataset.noPan !== undefined || n.getAttribute("aria-label") === "Add below")),
  });

  const caption = `${opts.title} · ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`;
  const band = 72;
  const out = document.createElement("canvas");
  out.width = chart.width;
  out.height = chart.height + band;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("This browser would not give us a canvas to draw on.");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(chart, 0, 0);
  ctx.fillStyle = getComputedStyle(document.body).color || "#111111";
  ctx.font = "28px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(caption, pad * 2, chart.height + 46);

  if (opts.format === "png") {
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
    if (!blob) throw new Error("The image could not be encoded.");
    save(blob, fileName(opts.title, "png"));
    return;
  }
  const { jsPDF } = await import("jspdf");
  const landscape = out.width >= out.height;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // The whole chart on one page — cropping would silently drop boxes.
  const scale = Math.min((pageW - 48) / out.width, (pageH - 48) / out.height);
  // JPEG + FAST: a PNG data URL embeds uncompressed (megabytes for a few cards).
  doc.addImage(out.toDataURL("image/jpeg", 0.92), "JPEG", 24, 24, out.width * scale, out.height * scale, undefined, "FAST");
  save(doc.output("blob"), fileName(opts.title, "pdf"));
}

import { downloadFile } from "@/components/agent-copy/export";