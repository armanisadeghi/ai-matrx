/**
 * Diagram Block Printer
 *
 * Two output strategies:
 *  1. "capture" variants — screenshot the live ReactFlow canvas via
 *     dom-capture-print-utils (handles oklch/lab CSS) → PDF
 *  2. "svg-export" variant — walk the diagram JSON and emit a pure SVG
 *     placed inside a styled print document → browser print dialog
 *
 * The capture approach is highest-fidelity (matches what the user sees).
 * The SVG approach is resolution-independent and works better for very
 * large or complex diagrams.
 */

import type {
  BlockPrinter,
  PrintSettings,
} from "@/lib/block-print/block-print-utils";
import {
  buildPrintDocument,
  openPrintWindow,
} from "@/lib/block-print/block-print-utils";
import type { DiagramData } from "./parseDiagramJSON";

// ─────────────────────────────────────────────────────────────────────────────
// Capture variants — PDF via html2canvas + jsPDF
// ─────────────────────────────────────────────────────────────────────────────

async function captureDiagramToPDF(
  element: HTMLElement,
  diagram: DiagramData,
  settings: PrintSettings,
): Promise<void> {
  const { captureToPDF } =
    await import("@/lib/block-print/dom-capture-print-utils");

  const orientation =
    (settings["orientation"] as "portrait" | "landscape") ?? "landscape";
  const paperSize = (settings["paperSize"] as "a4" | "letter") ?? "a4";
  const isDark = (settings["darkMode"] as boolean) ?? false;

  const background = isDark ? "#111827" : "#ffffff";

  await captureToPDF(element, {
    orientation,
    paperSize,
    background,
    filename:
      diagram.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "diagram",
    scale: settings["highRes"] ? 3 : 2,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG export variant — resolution-independent, browser print dialog
// ─────────────────────────────────────────────────────────────────────────────

const SVG_COLORS = {
  start: { bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
  end: { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d" },
  decision: { bg: "#ffedd5", border: "#ea580c", text: "#7c2d12" },
  process: { bg: "#dbeafe", border: "#2563eb", text: "#1e3a8a" },
  data: { bg: "#f3e8ff", border: "#9333ea", text: "#4a044e" },
  user: { bg: "#e0e7ff", border: "#4338ca", text: "#1e1b4b" },
  system: { bg: "#f3f4f6", border: "#4b5563", text: "#111827" },
  api: { bg: "#ccfbf1", border: "#0d9488", text: "#134e4a" },
  compute: { bg: "#fef9c3", border: "#ca8a04", text: "#713f12" },
  storage: { bg: "#fce7f3", border: "#db2777", text: "#500724" },
  event: { bg: "#cffafe", border: "#0891b2", text: "#164e63" },
  entity: { bg: "#ede9fe", border: "#7c3aed", text: "#2e1065" },
  gateway: { bg: "#fef3c7", border: "#d97706", text: "#78350f" },
  default: { bg: "#f9fafb", border: "#6b7280", text: "#111827" },
  // Pedigree
  pedigree_male: { bg: "#f9fafb", border: "#374151", text: "#111827" },
  pedigree_female: { bg: "#f9fafb", border: "#374151", text: "#111827" },
  pedigree_male_affected: { bg: "#1f2937", border: "#111827", text: "#ffffff" },
  pedigree_female_affected: {
    bg: "#1f2937",
    border: "#111827",
    text: "#ffffff",
  },
};

function esc(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvgDocument(
  diagram: DiagramData,
  settings: PrintSettings,
): string {
  const orientation = (settings["orientation"] as string) ?? "landscape";
  const isLandscape = orientation === "landscape";

  // Layout constants
  const NODE_W = 160;
  const NODE_H = 60;
  const PEDIGREE_SIZE = 70; // square/circle diameter
  const H_GAP = 60;
  const V_GAP = 80;
  const COLS = isLandscape ? 5 : 3;
  const MARGIN = 40;

  const isPedigree = diagram.type === "pedigree";

  // Position nodes in a simple grid if no positions provided
  const positioned = diagram.nodes.map((node, i) => ({
    ...node,
    x: node.position?.x ?? (i % COLS) * (NODE_W + H_GAP) + MARGIN,
    y: node.position?.y ?? Math.floor(i / COLS) * (NODE_H + V_GAP) + MARGIN,
  }));

  const allX = positioned.map((n) => n.x);
  const allY = positioned.map((n) => n.y);
  const minX = Math.min(...allX) - MARGIN;
  const minY = Math.min(...allY) - MARGIN;
  const maxX = Math.max(...allX) + NODE_W + MARGIN;
  const maxY =
    Math.max(...allY) + (isPedigree ? PEDIGREE_SIZE + 40 : NODE_H) + MARGIN;

  const svgW = maxX - minX;
  const svgH = maxY - minY;

  // Build node position lookup
  const posMap = new Map(
    positioned.map((n) => [n.id, { x: n.x - minX, y: n.y - minY }]),
  );

  // ── SVG nodes ──
  const nodesSvg = positioned
    .map((node) => {
      const pos = posMap.get(node.id)!;
      const nodeType = (node.nodeType ||
        node.type ||
        "default") as keyof typeof SVG_COLORS;
      const customColor = node.color;

      if (isPedigree) {
        const isAffected = node.affected;
        const isFemale = node.gender === "female";
        const isUnknown = !node.gender || node.gender === "unknown";
        const colorKey = isFemale
          ? isAffected
            ? "pedigree_female_affected"
            : "pedigree_female"
          : isAffected
            ? "pedigree_male_affected"
            : "pedigree_male";
        const c = SVG_COLORS[colorKey];
        const cx = pos.x + PEDIGREE_SIZE / 2;
        const cy = pos.y + PEDIGREE_SIZE / 2;
        const label = esc(node.label);
        const years =
          node.birthYear && node.deathYear
            ? `${node.birthYear}–${node.deathYear}`
            : node.birthYear
              ? `b.${node.birthYear}`
              : node.deathYear
                ? `d.${node.deathYear}`
                : "";

        const shape = isFemale
          ? `<circle cx="${cx}" cy="${cy}" r="${PEDIGREE_SIZE / 2}" fill="${c.bg}" stroke="${c.border}" stroke-width="2.5"/>`
          : isUnknown
            ? `<rect x="${pos.x}" y="${pos.y}" width="${PEDIGREE_SIZE}" height="${PEDIGREE_SIZE}" fill="${c.bg}" stroke="${c.border}" stroke-width="2.5" transform="rotate(45 ${cx} ${cy})"/>`
            : `<rect x="${pos.x}" y="${pos.y}" width="${PEDIGREE_SIZE}" height="${PEDIGREE_SIZE}" fill="${c.bg}" stroke="${c.border}" stroke-width="2.5"/>`;

        const deceased = node.deceased
          ? `<line x1="${pos.x + 8}" y1="${pos.y + PEDIGREE_SIZE - 8}" x2="${pos.x + PEDIGREE_SIZE - 8}" y2="${pos.y + 8}" stroke="${c.border}" stroke-width="1.5"/>`
          : "";

        const proband = node.proband
          ? `<text x="${pos.x - 12}" y="${cy + 4}" font-size="14" fill="#2563eb">↗</text>`
          : "";

        return `
  <g>
    ${shape}
    ${deceased}
    ${proband}
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="${c.text}">${label}</text>
    ${node.description ? `<text x="${cx}" y="${pos.y + PEDIGREE_SIZE + 14}" text-anchor="middle" font-size="8" font-family="sans-serif" fill="#374151">${esc(node.description)}</text>` : ""}
    ${years ? `<text x="${cx}" y="${pos.y + PEDIGREE_SIZE + 24}" text-anchor="middle" font-size="7" font-family="sans-serif" fill="#6b7280">${esc(years)}</text>` : ""}
  </g>`;
      }

      // Standard node
      const colors = customColor
        ? { bg: `${customColor}20`, border: customColor, text: customColor }
        : SVG_COLORS[nodeType in SVG_COLORS ? nodeType : "default"];

      const label = esc(node.label);
      const description = node.description ? esc(node.description) : "";

      return `
  <g>
    <rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" rx="8" ry="8"
      fill="${colors.bg}" stroke="${colors.border}" stroke-width="2"/>
    <text x="${pos.x + NODE_W / 2}" y="${pos.y + (description ? 20 : NODE_H / 2 + 5)}"
      text-anchor="middle" font-size="11" font-weight="600" font-family="sans-serif" fill="${colors.text}">${label}</text>
    ${description ? `<text x="${pos.x + NODE_W / 2}" y="${pos.y + 36}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="${colors.text}" opacity="0.7">${description}</text>` : ""}
  </g>`;
    })
    .join("\n");

  // ── SVG edges ──
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const edgesSvg = diagram.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((edge) => {
      const src = posMap.get(edge.source);
      const tgt = posMap.get(edge.target);
      if (!src || !tgt) return "";

      const isPedigreeMarriage =
        diagram.type === "pedigree" && edge.relationship === "marriage";
      const isPedigreeParent =
        diagram.type === "pedigree" && edge.relationship === "parent";
      const nodeSize = isPedigree ? PEDIGREE_SIZE : NODE_H;
      const nodeWidth = isPedigree ? PEDIGREE_SIZE : NODE_W;

      const x1 = src.x + nodeWidth / 2;
      const y1 = src.y + (isPedigreeMarriage ? nodeSize / 2 : nodeSize);
      const x2 = tgt.x + nodeWidth / 2;
      const y2 = tgt.y + (isPedigreeMarriage ? nodeSize / 2 : 0);

      const stroke = edge.color ?? (isPedigreeMarriage ? "#374151" : "#6b7280");
      const strokeWidth = isPedigreeMarriage ? 2.5 : (edge.strokeWidth ?? 2);
      const dashArray =
        edge.dashed || edge.relationship === "divorced" ? "6,3" : "none";
      const markerEnd = isPedigreeMarriage ? "" : "url(#arrow)";

      // Curved path for cleaner look
      const midY = (y1 + y2) / 2;
      const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

      const labelEl =
        edge.label && diagram.type !== "pedigree"
          ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="#6b7280">${esc(edge.label)}</text>`
          : "";

      return `
  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"
    stroke-dasharray="${dashArray}" marker-end="${markerEnd}"/>
  ${labelEl}`;
    })
    .join("\n");

  const pageW = isLandscape ? 297 : 210; // mm
  const pageH = isLandscape ? 210 : 297;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(diagram.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #fff;
      padding: 20px;
    }
    h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #111827;
      margin-bottom: 6px;
    }
    .description {
      font-size: 11pt;
      color: #4b5563;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      font-size: 9pt;
      padding: 2px 10px;
      border-radius: 999px;
      background: #dbeafe;
      color: #1d4ed8;
      margin-bottom: 16px;
    }
    .diagram-wrap {
      overflow: auto;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 16px;
      background: #fafafa;
    }
    svg { display: block; max-width: 100%; height: auto; }
    .print-actions {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .print-btn {
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      border: none;
      font-weight: 600;
    }
    .print-btn-primary { background: #2563eb; color: #fff; }
    .print-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
    @page { size: ${isLandscape ? "landscape" : "portrait"}; margin: 15mm; }
    @media print {
      .print-actions { display: none !important; }
      body { padding: 0; }
      .diagram-wrap { border: none; padding: 0; background: none; }
      svg { width: 100% !important; height: auto !important; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="print-btn print-btn-primary" onclick="window.print()">Print / Save as PDF</button>
    <button class="print-btn print-btn-secondary" onclick="window.close()">Close</button>
  </div>
  <h1>${esc(diagram.title)}</h1>
  ${diagram.description ? `<p class="description">${esc(diagram.description)}</p>` : ""}
  <span class="badge">${esc(diagram.type.charAt(0).toUpperCase() + diagram.type.slice(1))}</span>
  <div class="diagram-wrap">
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${svgW} ${svgH}"
      width="${svgW}"
      height="${svgH}">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280"/>
        </marker>
      </defs>
      ${edgesSvg}
      ${nodesSvg}
    </svg>
  </div>
</body>
</html>`;

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: factory that binds the diagram element ref
// ─────────────────────────────────────────────────────────────────────────────

export function createDiagramPrinter(
  getElement: () => HTMLElement | null,
  diagram: DiagramData,
): BlockPrinter {
  return {
    label: "Print Diagram",
    variants: [
      {
        id: "capture-landscape",
        label: "Screenshot — Landscape PDF",
        description:
          "Captures the diagram exactly as displayed. Best for most diagrams.",
      },
      {
        id: "capture-portrait",
        label: "Screenshot — Portrait PDF",
        description: "Same capture, rotated to portrait orientation.",
      },
      {
        id: "svg-landscape",
        label: "Vector — Landscape (print dialog)",
        description:
          "Resolution-independent SVG. Opens browser print dialog. Best for large diagrams.",
      },
      {
        id: "svg-portrait",
        label: "Vector — Portrait (print dialog)",
        description: "Same vector output, portrait layout.",
      },
    ],
    settings: [
      {
        type: "boolean",
        id: "highRes",
        label: "High resolution",
        description:
          "Render at 3× scale instead of 2×. Larger file, sharper output.",
        defaultValue: false,
        appliesTo: ["capture-landscape", "capture-portrait"],
      },
      {
        type: "boolean",
        id: "darkMode",
        label: "Dark background",
        description: "Use dark theme colors in the exported PDF.",
        defaultValue: false,
        appliesTo: ["capture-landscape", "capture-portrait"],
      },
    ],
    print: async (data, variantId, settings = {}) => {
      const d =
        (data as { diagram: DiagramData })?.diagram ?? (data as DiagramData);

      if (!variantId || variantId.startsWith("capture")) {
        const el = getElement();
        if (!el) {
          console.warn("[DiagramPrinter] No element to capture");
          return;
        }
        const orientation: "landscape" | "portrait" =
          variantId === "capture-portrait" ? "portrait" : "landscape";
        await captureDiagramToPDF(el, d, { ...settings, orientation });
      } else {
        // SVG path
        const orientation =
          variantId === "svg-portrait" ? "portrait" : "landscape";
        const html = buildSvgDocument(d, { ...settings, orientation });
        openPrintWindow(html, d.title || "diagram");
      }
    },
  };
}
