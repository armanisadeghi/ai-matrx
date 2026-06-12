/**
 * Pie adapter — the simplest grammar: header (+showData/title), title line,
 * `"label" : value` slices. All edits are per-line; new slices append.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type MermaidOp, type PieOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { ParseOutcome, PieDoc, PieSlice } from "../model/types";

const HEADER_RE = /^pie(\s+showData)?(?:\s+title\s+(.+))?\s*$/;
const TITLE_RE = /^title\s+(.+)$/;
const SLICE_RE = /^"([^"]*)"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*$/;
const SLICE_UNQUOTED_RE = /^([^:"]+?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*$/;

type PDoc = PieDoc & { headerTitle?: boolean; dirtyHeader?: boolean; dirtyTitle?: boolean };

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: PDoc = {
    kind: "pie",
    diagramType: "pie",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    showData: false,
    slices: [],
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
      const header = HEADER_RE.exec(trimmed);
      if (!header) return { status: "code-only", reason: "unrecognized pie header", diagnostics: [] };
      headerSeen = true;
      doc.showData = Boolean(header[1]);
      if (header[2]) {
        doc.title = header[2].trim().replace(/^"|"$/g, "");
        doc.headerTitle = true;
      }
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    const title = TITLE_RE.exec(trimmed);
    if (title && doc.title === undefined) {
      doc.title = title[1].trim().replace(/^"|"$/g, "");
      doc.sourceLines.push({ text: rawLine, ref: { entity: "title", id: "title" } });
      continue;
    }
    const slice = SLICE_RE.exec(trimmed) ?? SLICE_UNQUOTED_RE.exec(trimmed);
    if (slice) {
      const s: PieSlice = {
        id: `p${++counter}`,
        label: slice[1].trim(),
        value: Number(slice[2]),
        raw: rawLine,
      };
      doc.slices.push(s);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "slice", id: s.id } });
      continue;
    }
    return {
      status: "code-only",
      reason: `unrecognized statement: "${trimmed.slice(0, 40)}"`,
      diagnostics: [],
    };
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing pie header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function sliceLine(slice: PieSlice): string {
  return `"${slice.label.replace(/"/g, "'")}" : ${slice.value}`;
}

function headerLine(doc: PDoc): string {
  const parts = ["pie"];
  if (doc.showData) parts.push("showData");
  if (doc.headerTitle && doc.title) parts.push(`title ${doc.title}`);
  return parts.join(" ");
}

function serialize(doc: PieDoc): string {
  const pdoc = doc as PDoc;
  const out: string[] = [...doc.frontmatter];
  const sliceById = new Map(doc.slices.map((s) => [s.id, s]));
  const emitted = new Set<string>();
  let headerEmitted = false;

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    switch (line.ref.entity) {
      case "header":
        headerEmitted = true;
        out.push(pdoc.dirtyHeader ? `${indent}${headerLine(pdoc)}` : line.text);
        break;
      case "title":
        if (pdoc.title === undefined) break; // cleared
        out.push(pdoc.dirtyTitle ? `${indent}title ${pdoc.title}` : line.text);
        break;
      case "slice": {
        const slice = sliceById.get(line.ref.id);
        if (!slice) break;
        emitted.add(slice.id);
        out.push(slice.dirty ? `${indent}${sliceLine(slice)}` : line.text);
        break;
      }
      default:
        out.push(line.text);
    }
  }

  const additions: string[] = [];
  if (
    pdoc.title !== undefined &&
    !pdoc.headerTitle &&
    !doc.sourceLines.some((l) => l.ref?.entity === "title")
  ) {
    // Insert the title right after the header for correctness.
    const headerIndex = out.findIndex((l) => /^\s*pie\b/.test(l));
    if (headerIndex >= 0) out.splice(headerIndex + 1, 0, `  title ${pdoc.title}`);
  }
  for (const slice of doc.slices) {
    if (!emitted.has(slice.id) && !slice.raw) additions.push(`  ${sliceLine(slice)}`);
  }
  void headerEmitted;
  return [...out, ...additions].join("\n");
}

function applyOp(doc: PieDoc, op: MermaidOp): PieDoc {
  const next = structuredClone(doc) as PDoc;
  const pop = op as PieOp;
  const slice = (id: string) => {
    const s = next.slices.find((x) => x.id === id);
    if (!s) throw new MermaidOpError("That slice no longer exists");
    return s;
  };

  switch (pop.type) {
    case "setTitle": {
      next.title = pop.title || undefined;
      if (next.headerTitle) next.dirtyHeader = true;
      else next.dirtyTitle = true;
      return next;
    }
    case "setShowData": {
      next.showData = pop.enabled;
      next.dirtyHeader = true;
      return next;
    }
    case "addSlice": {
      next.slices.push({
        id: `p_a${next.slices.length + 1}`,
        label: pop.label,
        value: pop.value,
      });
      return next;
    }
    case "editSlice": {
      const s = slice(pop.id);
      if (pop.label !== undefined) s.label = pop.label;
      if (pop.value !== undefined) s.value = pop.value;
      s.dirty = true;
      return next;
    }
    case "deleteSlice": {
      slice(pop.id);
      next.slices = next.slices.filter((s) => s.id !== pop.id);
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for pie charts");
  }
}

export const pieAdapter: MermaidAdapter<PieDoc> = {
  diagramType: "pie",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Slice", addNode: "Add slice" },
};
