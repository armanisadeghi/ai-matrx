/**
 * Timeline adapter. Rows (`period : event : event`) and sections edit
 * per-line; structural inserts/deletes regenerate the body wholesale
 * (content-preserving, formatting-normalizing).
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type MermaidOp, type TimelineOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { ParseOutcome, TimelineDoc, TimelineRow, TimelineSection } from "../model/types";

type TDoc = TimelineDoc & { regenerateAll?: boolean; dirtyTitle?: boolean };

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: TDoc = {
    kind: "timeline",
    diagramType: "timeline",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    sections: [],
  };

  let headerSeen = false;
  let counter = 0;
  let sectionCounter = 0;
  let currentSection: TimelineSection | null = null;
  let lastRow: TimelineRow | null = null;

  const implicitSection = (): TimelineSection => {
    if (!currentSection) {
      currentSection = { id: `sec${++sectionCounter}`, rows: [] };
      doc.sections.push(currentSection);
    }
    return currentSection;
  };

  for (const rawLine of lines.slice(bodyStartIndex)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      doc.sourceLines.push({ text: rawLine });
      continue;
    }
    if (!headerSeen) {
      if (!/^timeline\s*$/.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized timeline header", diagnostics: [] };
      }
      headerSeen = true;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    const title = /^title\s+(.+)$/.exec(trimmed);
    if (title && doc.title === undefined) {
      doc.title = title[1].trim();
      doc.sourceLines.push({ text: rawLine, ref: { entity: "title", id: "title" } });
      continue;
    }
    const section = /^section\s+(.+)$/.exec(trimmed);
    if (section) {
      currentSection = {
        id: `sec${++sectionCounter}`,
        title: section[1].trim(),
        rows: [],
        raw: rawLine,
      };
      doc.sections.push(currentSection);
      lastRow = null;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "section", id: currentSection.id } });
      continue;
    }
    if (trimmed.startsWith(":")) {
      // Continuation events for the previous row.
      if (!lastRow) {
        return { status: "code-only", reason: "event continuation with no period", diagnostics: [] };
      }
      const events = trimmed
        .split(":")
        .map((e) => e.trim())
        .filter(Boolean);
      lastRow.events.push(...events);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "rowCont", id: lastRow.id } });
      continue;
    }
    if (trimmed.includes(":")) {
      const [period, ...events] = trimmed.split(":").map((p) => p.trim());
      const row: TimelineRow = {
        id: `t${++counter}`,
        period,
        events: events.filter(Boolean),
        raw: rawLine,
      };
      implicitSection().rows.push(row);
      lastRow = row;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "row", id: row.id } });
      continue;
    }
    // A bare period with no events is valid timeline syntax.
    const row: TimelineRow = { id: `t${++counter}`, period: trimmed, events: [], raw: rawLine };
    implicitSection().rows.push(row);
    lastRow = row;
    doc.sourceLines.push({ text: rawLine, ref: { entity: "row", id: row.id } });
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing timeline header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function rowLine(row: TimelineRow): string {
  return row.events.length > 0 ? `${row.period} : ${row.events.join(" : ")}` : row.period;
}

function serialize(doc: TimelineDoc): string {
  const tdoc = doc as TDoc;
  const out: string[] = [...doc.frontmatter];

  if (tdoc.regenerateAll) {
    const comments = doc.sourceLines
      .filter((l) => !l.ref && l.text.trim().startsWith("%%"))
      .map((l) => l.text);
    out.push("timeline", ...comments);
    if (doc.title !== undefined) out.push(`  title ${doc.title}`);
    for (const section of doc.sections) {
      if (section.title !== undefined) out.push(`  section ${section.title}`);
      for (const row of section.rows) out.push(`    ${rowLine(row)}`);
    }
    return out.join("\n");
  }

  const rowById = new Map<string, TimelineRow>();
  const sectionById = new Map<string, TimelineSection>();
  for (const section of doc.sections) {
    sectionById.set(section.id, section);
    for (const row of section.rows) rowById.set(row.id, row);
  }
  const emitted = new Set<string>();

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    switch (line.ref.entity) {
      case "title":
        if (doc.title === undefined) break;
        out.push(tdoc.dirtyTitle ? `${indent}title ${doc.title}` : line.text);
        break;
      case "section": {
        const section = sectionById.get(line.ref.id);
        if (!section) break;
        out.push(section.dirty ? `${indent}section ${section.title ?? ""}` : line.text);
        break;
      }
      case "row": {
        const row = rowById.get(line.ref.id);
        if (!row) break;
        emitted.add(row.id);
        out.push(row.dirty ? `${indent}${rowLine(row)}` : line.text);
        break;
      }
      case "rowCont": {
        const row = rowById.get(line.ref.id);
        // Dirty rows emit everything on their main line; skip continuations.
        if (!row || row.dirty) break;
        out.push(line.text);
        break;
      }
      default:
        out.push(line.text);
    }
  }
  return out.join("\n");
}

function applyOp(doc: TimelineDoc, op: MermaidOp): TimelineDoc {
  const next = structuredClone(doc) as TDoc;
  const top = op as TimelineOp;
  const findRow = (id: string) => {
    for (const section of next.sections) {
      const row = section.rows.find((r) => r.id === id);
      if (row) return row;
    }
    throw new MermaidOpError("That entry no longer exists");
  };
  const findSection = (id: string) => {
    const s = next.sections.find((x) => x.id === id);
    if (!s) throw new MermaidOpError("That section no longer exists");
    return s;
  };

  switch (top.type) {
    case "setTitle": {
      next.title = top.title || undefined;
      next.dirtyTitle = true;
      if (!next.sourceLines.some((l) => l.ref?.entity === "title")) next.regenerateAll = true;
      return next;
    }
    case "addSection": {
      next.sections.push({ id: `sec_a${next.sections.length + 1}`, title: top.title, rows: [] });
      next.regenerateAll = true;
      return next;
    }
    case "renameSection": {
      const s = findSection(top.id);
      s.title = top.title;
      s.dirty = true;
      return next;
    }
    case "deleteSection": {
      findSection(top.id);
      next.sections = next.sections.filter((s) => s.id !== top.id);
      next.regenerateAll = true;
      return next;
    }
    case "addRow": {
      const s = findSection(top.sectionId);
      s.rows.push({
        id: `t_a${s.rows.length + 1}`,
        period: top.period,
        events: top.event ? [top.event] : [],
      });
      next.regenerateAll = true;
      return next;
    }
    case "editRow": {
      const row = findRow(top.id);
      if (top.period !== undefined) row.period = top.period;
      row.dirty = true;
      return next;
    }
    case "addEvent": {
      const row = findRow(top.rowId);
      row.events.push(top.text);
      row.dirty = true;
      return next;
    }
    case "editEvent": {
      const row = findRow(top.rowId);
      if (top.eventIndex < 0 || top.eventIndex >= row.events.length) {
        throw new MermaidOpError("That event no longer exists");
      }
      row.events[top.eventIndex] = top.text;
      row.dirty = true;
      return next;
    }
    case "deleteEvent": {
      const row = findRow(top.rowId);
      row.events.splice(top.eventIndex, 1);
      row.dirty = true;
      return next;
    }
    case "deleteRow": {
      findRow(top.id);
      for (const section of next.sections) {
        section.rows = section.rows.filter((r) => r.id !== top.id);
      }
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for timelines");
  }
}

export const timelineAdapter: MermaidAdapter<TimelineDoc> = {
  diagramType: "timeline",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Entry", addNode: "Add entry" },
};
