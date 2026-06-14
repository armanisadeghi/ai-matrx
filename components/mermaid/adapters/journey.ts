/**
 * User Journey adapter. Sections group tasks; each task is
 * `Name: score: actor, actor`. Edits are per-line; structural inserts/deletes
 * regenerate the body (content-preserving, formatting-normalizing) — the same
 * shape as the timeline adapter.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type JourneyOp, type MermaidOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { JourneyDoc, JourneySection, JourneyTask, ParseOutcome } from "../model/types";

type JDoc = JourneyDoc & { regenerateAll?: boolean; dirtyTitle?: boolean };

// "Task name : score : actor, actor"  (actors optional)
const TASK_RE = /^(.+?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(?::\s*(.*))?$/;

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: JDoc = {
    kind: "journey",
    diagramType: "journey",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    sections: [],
  };

  let headerSeen = false;
  let counter = 0;
  let sectionCounter = 0;
  let currentSection: JourneySection | null = null;

  const implicitSection = (): JourneySection => {
    if (!currentSection) {
      currentSection = { id: `sec${++sectionCounter}`, tasks: [] };
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
      if (!/^journey\s*$/.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized journey header", diagnostics: [] };
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
      currentSection = { id: `sec${++sectionCounter}`, title: section[1].trim(), tasks: [], raw: rawLine };
      doc.sections.push(currentSection);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "section", id: currentSection.id } });
      continue;
    }
    const task = TASK_RE.exec(trimmed);
    if (task) {
      const actors = (task[3] ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const t: JourneyTask = {
        id: `j${++counter}`,
        name: task[1].trim(),
        score: Number(task[2]),
        actors,
        raw: rawLine,
      };
      implicitSection().tasks.push(t);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "task", id: t.id } });
      continue;
    }
    return {
      status: "code-only",
      reason: `unrecognized statement: "${trimmed.slice(0, 40)}"`,
      diagnostics: [],
    };
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing journey header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function taskLine(task: JourneyTask): string {
  const actors = task.actors.length > 0 ? `: ${task.actors.join(", ")}` : "";
  return `${task.name}: ${task.score}${actors}`;
}

function serialize(doc: JourneyDoc): string {
  const jdoc = doc as JDoc;
  const out: string[] = [...doc.frontmatter];

  if (jdoc.regenerateAll) {
    const comments = doc.sourceLines
      .filter((l) => !l.ref && l.text.trim().startsWith("%%"))
      .map((l) => l.text);
    out.push("journey", ...comments);
    if (doc.title !== undefined) out.push(`  title ${doc.title}`);
    for (const section of doc.sections) {
      if (section.title !== undefined) out.push(`  section ${section.title}`);
      for (const task of section.tasks) out.push(`    ${taskLine(task)}`);
    }
    return out.join("\n");
  }

  const taskById = new Map<string, JourneyTask>();
  const sectionById = new Map<string, JourneySection>();
  for (const section of doc.sections) {
    sectionById.set(section.id, section);
    for (const task of section.tasks) taskById.set(task.id, task);
  }

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    switch (line.ref.entity) {
      case "title":
        if (doc.title === undefined) break;
        out.push(jdoc.dirtyTitle ? `${indent}title ${doc.title}` : line.text);
        break;
      case "section": {
        const section = sectionById.get(line.ref.id);
        if (!section) break;
        out.push(section.dirty ? `${indent}section ${section.title ?? ""}` : line.text);
        break;
      }
      case "task": {
        const task = taskById.get(line.ref.id);
        if (!task) break;
        out.push(task.dirty ? `${indent}${taskLine(task)}` : line.text);
        break;
      }
      default:
        out.push(line.text);
    }
  }
  return out.join("\n");
}

function applyOp(doc: JourneyDoc, op: MermaidOp): JourneyDoc {
  const next = structuredClone(doc) as JDoc;
  const jop = op as JourneyOp;
  const findTask = (id: string) => {
    for (const section of next.sections) {
      const task = section.tasks.find((t) => t.id === id);
      if (task) return task;
    }
    throw new MermaidOpError("That task no longer exists");
  };
  const findSection = (id: string) => {
    const s = next.sections.find((x) => x.id === id);
    if (!s) throw new MermaidOpError("That section no longer exists");
    return s;
  };

  switch (jop.type) {
    case "setTitle": {
      next.title = jop.title || undefined;
      next.dirtyTitle = true;
      if (!next.sourceLines.some((l) => l.ref?.entity === "title")) next.regenerateAll = true;
      return next;
    }
    case "addSection": {
      next.sections.push({ id: `sec_a${next.sections.length + 1}`, title: jop.title, tasks: [] });
      next.regenerateAll = true;
      return next;
    }
    case "renameSection": {
      const s = findSection(jop.id);
      s.title = jop.title;
      s.dirty = true;
      return next;
    }
    case "deleteSection": {
      findSection(jop.id);
      next.sections = next.sections.filter((s) => s.id !== jop.id);
      next.regenerateAll = true;
      return next;
    }
    case "addTask": {
      const s = findSection(jop.sectionId);
      s.tasks.push({
        id: `j_a${s.tasks.length + 1}`,
        name: jop.name,
        score: jop.score ?? 3,
        actors: jop.actors ?? [],
      });
      next.regenerateAll = true;
      return next;
    }
    case "editTask": {
      const task = findTask(jop.id);
      if (jop.name !== undefined) task.name = jop.name;
      if (jop.score !== undefined) task.score = jop.score;
      if (jop.actors !== undefined) task.actors = jop.actors;
      task.dirty = true;
      return next;
    }
    case "deleteTask": {
      findTask(jop.id);
      for (const section of next.sections) {
        section.tasks = section.tasks.filter((t) => t.id !== jop.id);
      }
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for journeys");
  }
}

export const journeyAdapter: MermaidAdapter<JourneyDoc> = {
  diagramType: "journey",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Task", addNode: "Add task" },
};
