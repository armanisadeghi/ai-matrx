// features/hr/people/org-chart/orgChartExport.ts
//
// 🚨 THE CSV IS THE CHART'S ROWS, NOT A DIRECTORY DUMP (SPEC-EMPLOYEES §5.2).
// One row per node, with the manager it is drawn under, the level it sits at,
// and the as-of date on EVERY row — because a chart export without the date it
// was true on is an assertion nobody can check.
//
// The as-of date also travels in the FILENAME and in a header line, so a file
// that leaves this app carries what it is.
//
// It is safe to build client-side precisely because it carries nothing the chart
// does not already draw: display name, title, department, location, manager,
// FTE, worker class. No Confidential-tier column is in `hr_org_chart`'s payload
// at all, so none can leak into this file. The DIRECTORY export is a different
// story and is deliberately not shipped unaudited — see
// `hr.people.directory-export` in the coming-soon registry.

import type { HrOrgChart } from "../../types";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function orgChartExportName(asOf: string, extension: string): string {
  return `org-chart-as-of-${asOf}.${extension}`;
}

/** Depth of each node, computed the same way the layout does. */
function depths(chart: HrOrgChart): Map<string, number> {
  const managerOf = new Map(
    chart.nodes.map((node) => [node.employment_id, node.manager_employment_id]),
  );
  const out = new Map<string, number>();

  for (const node of chart.nodes) {
    let depth = 0;
    let current = node.manager_employment_id;
    const seen = new Set<string>([node.employment_id]);
    // The same cycle guard the layout uses: a loop stops rather than hanging.
    while (current && !seen.has(current) && managerOf.has(current)) {
      seen.add(current);
      depth += 1;
      current = managerOf.get(current) ?? null;
    }
    out.set(node.employment_id, depth);
  }
  return out;
}

export function buildOrgChartCsv(chart: HrOrgChart): string {
  const level = depths(chart);
  const nameOf = new Map(
    chart.nodes.map((node) => [node.employment_id, node.display_name]),
  );
  const cycles = new Set(chart.cycles);

  const lines: string[] = [];
  // A header line before the columns, so the date survives being opened in a
  // spreadsheet and re-saved.
  lines.push(`# Org chart as of ${chart.as_of}`);
  lines.push(
    [
      "as_of",
      "level",
      "display_name",
      "job_title",
      "department",
      "location",
      "manager",
      "fte",
      "worker_class",
      "placement",
      "employee_id",
      "employment_id",
    ].join(","),
  );

  for (const node of chart.nodes) {
    lines.push(
      [
        chart.as_of,
        level.get(node.employment_id) ?? 0,
        node.display_name,
        node.job_title,
        node.department,
        node.location,
        node.manager_employment_id
          ? (nameOf.get(node.manager_employment_id) ?? "")
          : "",
        node.fte,
        node.worker_class,
        cycles.has(node.employment_id) ? "reporting loop" : "on chart",
        node.employee_id,
        node.employment_id,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // 🚨 THE TRAY IS IN THE FILE TOO. Somebody who exports the chart to review
  // headcount must not silently lose the people the chart could not place.
  for (const person of chart.unplaced) {
    lines.push(
      [
        chart.as_of,
        "",
        person.display_name,
        "",
        "",
        "",
        "",
        "",
        "",
        `not yet placed — ${person.reason}`,
        person.employee_id,
        person.employment_id,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}

export function downloadOrgChartCsv(chart: HrOrgChart): void {
  const blob = new Blob([buildOrgChartCsv(chart)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = orgChartExportName(chart.as_of, "csv");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/*
  ── PDF and PNG ────────────────────────────────────────────────────────────
  R-L1 B4 promises PDF · PNG · CSV. CSV was built; these two were
  `announceComingSoon` stubs, so two thirds of a promised row did nothing.

  🚨 THE AS-OF DATE TRAVELS INTO THE FILE, NOT JUST THE FILENAME. A chart is
  only true of a date, and an image outlives the screen it was taken from — a
  PNG in somebody's slide deck with no date on it is a claim about today
  forever. The filename carries it, and so does a caption burnt into the image
  and a header line drawn on the PDF page, because a filename does not survive
  being pasted into a document.

  These rasterise the LIVE chart node rather than re-drawing it, so what is
  exported is exactly what the person is looking at — including the withheld
  nodes rendered as statements, which must not turn back into names in an
  export.
*/

/** Shared by both raster paths: the chart as a canvas, at a readable scale. */
async function rasterise(node: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(node, {
    // 2× so text stays legible when the image is scaled in a deck or a print.
    scale: 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
    logging: false,
    useCORS: true,
  });
}

/** Push bytes at the browser through the one anchor-download path. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadOrgChartPng(
  node: HTMLElement,
  asOf: string,
): Promise<void> {
  const canvas = await rasterise(node);

  // The caption is drawn ON the image, under the chart, so the date cannot be
  // separated from the picture the way a filename can.
  const pad = 56;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height + pad;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("This browser would not give us a canvas to draw on.");
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = getComputedStyle(document.body).color || "#111111";
  ctx.font = "24px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(`Org chart as of ${asOf}`, 16, canvas.height + 36);

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The image could not be encoded.");
  saveBlob(blob, orgChartExportName(asOf, "png"));
}

export async function downloadOrgChartPdf(
  node: HTMLElement,
  asOf: string,
): Promise<void> {
  const canvas = await rasterise(node);
  const { jsPDF } = await import("jspdf");

  // Landscape: an org chart is wider than it is tall almost by definition.
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const header = `Org chart as of ${asOf}`;
  doc.setFontSize(12);
  doc.text(header, 24, 28);

  // Fit the whole chart on one page rather than cropping it — a truncated org
  // chart silently drops people, which is worse than a small one.
  const top = 44;
  const availW = pageW - 48;
  const availH = pageH - top - 24;
  const scale = Math.min(availW / canvas.width, availH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;

  /*
    🚨 COMPRESSED, AND JPEG RATHER THAN PNG. jsPDF embeds a PNG data URL
    uncompressed: a four-node chart came out at 13 MB, which is not a file
    anyone will email. A chart is flat colour and text, so JPEG at high quality
    is visually indistinguishable here and an order of magnitude smaller, and
    "FAST" turns on jsPDF's own deflate on top. The PNG export stays lossless —
    that is the one for archiving; the PDF is the one for sending.
  */
  doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 24, top, w, h, undefined, "FAST");
  saveBlob(doc.output("blob"), orgChartExportName(asOf, "pdf"));
}
