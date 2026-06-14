/**
 * Quadrant chart adapter. Singletons (title, x-axis, y-axis, quadrant-1..4) and
 * points (`Label: [x, y]`). Edits are per-line; a singleton set for the first
 * time is inserted after the header; points append. Lossless by construction.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type MermaidOp, type QuadrantOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { ParseOutcome, QuadrantDoc, QuadrantPoint } from "../model/types";

const TITLE_RE = /^title\s+(.+)$/;
const XAXIS_RE = /^x-axis\s+(.+)$/;
const YAXIS_RE = /^y-axis\s+(.+)$/;
const QUADRANT_RE = /^quadrant-([1-4])\s+(.+)$/;
const POINT_RE = /^(.+?):\s*\[\s*([0-9]*\.?[0-9]+)\s*,\s*([0-9]*\.?[0-9]+)\s*\]\s*$/;

type QDoc = QuadrantDoc & {
  dirty: Partial<Record<"title" | "xAxis" | "yAxis" | "q0" | "q1" | "q2" | "q3", boolean>>;
  present: Set<string>;
};

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: QDoc = {
    kind: "quadrant",
    diagramType: "quadrant",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    quadrantLabels: [undefined, undefined, undefined, undefined],
    points: [],
    dirty: {},
    present: new Set(),
  };

  let headerSeen = false;
  let counter = 0;

  for (const rawLine of lines.slice(bodyStartIndex)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      doc.sourceLines.push({ text: rawLine });
      continue;
    }
    if (!headerSeen) {
      if (!/^quadrantChart\s*$/.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized quadrant header", diagnostics: [] };
      }
      headerSeen = true;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    const title = TITLE_RE.exec(trimmed);
    if (title && doc.title === undefined) {
      doc.title = title[1].trim();
      doc.present.add("title");
      doc.sourceLines.push({ text: rawLine, ref: { entity: "title", id: "title" } });
      continue;
    }
    const xaxis = XAXIS_RE.exec(trimmed);
    if (xaxis && doc.xAxis === undefined) {
      doc.xAxis = xaxis[1].trim();
      doc.present.add("xAxis");
      doc.sourceLines.push({ text: rawLine, ref: { entity: "xAxis", id: "xAxis" } });
      continue;
    }
    const yaxis = YAXIS_RE.exec(trimmed);
    if (yaxis && doc.yAxis === undefined) {
      doc.yAxis = yaxis[1].trim();
      doc.present.add("yAxis");
      doc.sourceLines.push({ text: rawLine, ref: { entity: "yAxis", id: "yAxis" } });
      continue;
    }
    const quad = QUADRANT_RE.exec(trimmed);
    if (quad) {
      const idx = Number(quad[1]) - 1;
      if (doc.quadrantLabels[idx] === undefined) {
        doc.quadrantLabels[idx] = quad[2].trim();
        doc.present.add(`q${idx}`);
        doc.sourceLines.push({ text: rawLine, ref: { entity: "quadrant", id: String(idx) } });
        continue;
      }
    }
    const point = POINT_RE.exec(trimmed);
    if (point) {
      const p: QuadrantPoint = {
        id: `q${++counter}`,
        label: point[1].trim(),
        x: Number(point[2]),
        y: Number(point[3]),
        raw: rawLine,
      };
      doc.points.push(p);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "point", id: p.id } });
      continue;
    }
    return {
      status: "code-only",
      reason: `unrecognized statement: "${trimmed.slice(0, 40)}"`,
      diagnostics: [],
    };
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing quadrantChart header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function pointLine(p: QuadrantPoint): string {
  return `${p.label}: [${p.x}, ${p.y}]`;
}

function serialize(doc: QuadrantDoc): string {
  const qdoc = doc as QDoc;
  const out: string[] = [...doc.frontmatter];
  const pointById = new Map(doc.points.map((p) => [p.id, p]));
  const emitted = new Set<string>();
  // Anchor new singletons after the last existing header/title/axis/quadrant
  // line (so a freshly-set axis lands after an existing title, not before it).
  let singletonAnchor = -1;

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    switch (line.ref.entity) {
      case "header":
        out.push(line.text);
        singletonAnchor = out.length - 1;
        break;
      case "title":
        if (doc.title === undefined) break;
        out.push(qdoc.dirty.title ? `${indent}title ${doc.title}` : line.text);
        singletonAnchor = out.length - 1;
        break;
      case "xAxis":
        if (doc.xAxis === undefined) break;
        out.push(qdoc.dirty.xAxis ? `${indent}x-axis ${doc.xAxis}` : line.text);
        singletonAnchor = out.length - 1;
        break;
      case "yAxis":
        if (doc.yAxis === undefined) break;
        out.push(qdoc.dirty.yAxis ? `${indent}y-axis ${doc.yAxis}` : line.text);
        singletonAnchor = out.length - 1;
        break;
      case "quadrant": {
        const idx = Number(line.ref.id);
        const label = doc.quadrantLabels[idx];
        if (label === undefined) break;
        const dirtyKey = `q${idx}` as "q0" | "q1" | "q2" | "q3";
        out.push(qdoc.dirty[dirtyKey] ? `${indent}quadrant-${idx + 1} ${label}` : line.text);
        singletonAnchor = out.length - 1;
        break;
      }
      case "point": {
        const p = pointById.get(line.ref.id);
        if (!p) break;
        emitted.add(p.id);
        out.push(p.dirty ? `${indent}${pointLine(p)}` : line.text);
        break;
      }
      default:
        out.push(line.text);
    }
  }

  // Singletons set for the first time → insert after the last existing
  // header/title/axis/quadrant line, before any points. Points → append.
  const inserts: string[] = [];
  if (doc.title !== undefined && !qdoc.present.has("title")) inserts.push(`  title ${doc.title}`);
  if (doc.xAxis !== undefined && !qdoc.present.has("xAxis")) inserts.push(`  x-axis ${doc.xAxis}`);
  if (doc.yAxis !== undefined && !qdoc.present.has("yAxis")) inserts.push(`  y-axis ${doc.yAxis}`);
  for (let i = 0; i < 4; i++) {
    if (doc.quadrantLabels[i] !== undefined && !qdoc.present.has(`q${i}`)) {
      inserts.push(`  quadrant-${i + 1} ${doc.quadrantLabels[i]}`);
    }
  }
  if (inserts.length > 0 && singletonAnchor >= 0) out.splice(singletonAnchor + 1, 0, ...inserts);

  const additions: string[] = [];
  for (const p of doc.points) {
    if (!emitted.has(p.id) && !p.raw) additions.push(`  ${pointLine(p)}`);
  }
  return [...out, ...additions].join("\n");
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function applyOp(doc: QuadrantDoc, op: MermaidOp): QuadrantDoc {
  const next = structuredClone(doc) as QDoc;
  const qop = op as QuadrantOp;
  const findPoint = (id: string) => {
    const p = next.points.find((x) => x.id === id);
    if (!p) throw new MermaidOpError("That point no longer exists");
    return p;
  };

  switch (qop.type) {
    case "setTitle": {
      next.title = qop.title || undefined;
      next.dirty.title = true;
      return next;
    }
    case "setXAxis": {
      next.xAxis = qop.text || undefined;
      next.dirty.xAxis = true;
      return next;
    }
    case "setYAxis": {
      next.yAxis = qop.text || undefined;
      next.dirty.yAxis = true;
      return next;
    }
    case "setQuadrantLabel": {
      if (qop.index < 0 || qop.index > 3) throw new MermaidOpError("Quadrant index out of range");
      next.quadrantLabels[qop.index] = qop.text || undefined;
      next.dirty[`q${qop.index}` as "q0" | "q1" | "q2" | "q3"] = true;
      return next;
    }
    case "addPoint": {
      next.points.push({
        id: `q_a${next.points.length + 1}`,
        label: qop.label,
        x: clamp01(qop.x ?? 0.5),
        y: clamp01(qop.y ?? 0.5),
      });
      return next;
    }
    case "editPoint": {
      const p = findPoint(qop.id);
      if (qop.label !== undefined) p.label = qop.label;
      if (qop.x !== undefined) p.x = clamp01(qop.x);
      if (qop.y !== undefined) p.y = clamp01(qop.y);
      p.dirty = true;
      return next;
    }
    case "deletePoint": {
      findPoint(qop.id);
      next.points = next.points.filter((p) => p.id !== qop.id);
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for quadrant charts");
  }
}

export const quadrantAdapter: MermaidAdapter<QuadrantDoc> = {
  diagramType: "quadrant",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Point", addNode: "Add point" },
};
