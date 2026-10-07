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
import { toDelimitedText } from "@ai-matrx/alchemy/operate/read";
import type { Json } from "@ai-matrx/alchemy/operate";
import { downloadFile } from "@ai-matrx/kit/download";

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

const ORG_CHART_COLUMNS = [
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
] as const;

export function buildOrgChartCsv(chart: HrOrgChart): string {
  const level = depths(chart);
  const nameOf = new Map(
    chart.nodes.map((node) => [node.employment_id, node.display_name]),
  );
  const cycles = new Set(chart.cycles);

  const rows: Json[][] = [];
  for (const node of chart.nodes) {
    rows.push(
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
      ],
    );
  }

  // 🚨 THE TRAY IS IN THE FILE TOO. Somebody who exports the chart to review
  // headcount must not silently lose the people the chart could not place.
  for (const person of chart.unplaced) {
    rows.push(
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
      ],
    );
  }

  // The date travels IN the data (the `as_of` column on every row) and in the
  // filename — never as a `# …` comment line above the header, which a strict
  // CSV reader takes as the header row itself.
  return toDelimitedText(ORG_CHART_COLUMNS, rows, { spreadsheetSafe: true });
}

export function downloadOrgChartCsv(chart: HrOrgChart): void {
  const blob = new Blob([buildOrgChartCsv(chart)], {
    type: "text/csv;charset=utf-8",
  });
  downloadFile(orgChartExportName(chart.as_of, "csv"), blob, blob.type);
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

/**
 * Shared by both raster paths: the chart as a canvas, at a readable scale. A picture of a
 * visual surface (SVG connectors, transforms, modern colours) is Alchemy's html-to-image door,
 * `renderElement`; html2canvas (`captureElement`) is for documents.
 */
async function rasterise(node: HTMLElement): Promise<HTMLCanvasElement> {
  const { renderElement } = await import("@ai-matrx/alchemy/operate/capture");
  return renderElement(node, {
    // 2× so text stays legible when the image is scaled in a deck or a print.
    pixelRatio: 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
  });
}

/** Push bytes at the browser through the one anchor-download path. */
function saveBlob(blob: Blob, filename: string): void {
  downloadFile(filename, blob, blob.type);
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

  const { canvasToBlob } = await import("@ai-matrx/alchemy/operate/capture");
  saveBlob(await canvasToBlob(out, "image/png"), orgChartExportName(asOf, "png"));
}

export async function downloadOrgChartPdf(
  node: HTMLElement,
  asOf: string,
): Promise<void> {
  const canvas = await rasterise(node);
  const { pagesToPdf } = await import("@ai-matrx/alchemy/operate/capture");
  // Landscape: an org chart is wider than it is tall almost by definition.
  // The whole chart fits on one page rather than being cropped — a truncated
  // org chart silently drops people, which is worse than a small one.
  /*
    🚨 COMPRESSED, AND JPEG RATHER THAN PNG. A PNG data URL embeds
    uncompressed: a four-node chart came out at 13 MB, which is not a file
    anyone will email. A chart is flat colour and text, so JPEG at high quality
    is visually indistinguishable here and an order of magnitude smaller, and
    "FAST" turns on the PDF writer's own deflate on top. The PNG export stays
    lossless — that is the one for archiving; the PDF is the one for sending.
  */
  const pdf = await pagesToPdf(
    [
      {
        image: canvas,
        imageType: "JPEG",
        quality: 0.92,
        compression: "FAST",
        placement: { top: 44, right: 24, bottom: 24, left: 24 },
        header: { text: `Org chart as of ${asOf}`, x: 24, y: 28, fontSize: 12 },
      },
    ],
    { orientation: "landscape", unit: "pt", format: "a4" },
  );
  saveBlob(pdf, orgChartExportName(asOf, "pdf"));
}
