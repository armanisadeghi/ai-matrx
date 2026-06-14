/**
 * Entity-relationship adapter. Relationships (`A ||--o{ B : label`) are fully
 * structurally editable (cardinality, label, reverse, delete, add). Entity
 * attribute blocks (`ENTITY { … }`) are recognized and re-emitted verbatim —
 * entities are listed but their attributes are edited in Code mode. An unclosed
 * block or any unrecognized statement downgrades to code-only.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type ErOp, type MermaidOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { ErDoc, ErEntity, ErRelationship, ParseOutcome } from "../model/types";

const ENTITY = `("[^"]*"|[\\w-]+)`;
const REL_RE = new RegExp(`^${ENTITY}\\s+([|o}{]{2})(--|\\.\\.)([|o}{]{2})\\s+${ENTITY}\\s*:\\s*(.*)$`);
const BLOCK_OPEN_RE = new RegExp(`^${ENTITY}\\s*\\{\\s*$`);
const DIRECTION_RE = /^direction\s+\w+\s*$/;

function stripQuotes(s: string): string {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: ErDoc = {
    kind: "er",
    diagramType: "er",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    entities: [],
    relationships: [],
  };

  const byId = new Map<string, ErEntity>();
  const ensure = (id: string): ErEntity => {
    let e = byId.get(id);
    if (!e) {
      e = { id };
      byId.set(id, e);
      doc.entities.push(e);
    }
    return e;
  };

  const body = lines.slice(bodyStartIndex);
  let headerSeen = false;
  let counter = 0;

  for (let i = 0; i < body.length; i++) {
    const rawLine = body[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      doc.sourceLines.push({ text: rawLine });
      continue;
    }
    if (!headerSeen) {
      if (!/^erDiagram\s*$/.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized ER header", diagnostics: [] };
      }
      headerSeen = true;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    if (DIRECTION_RE.test(trimmed)) {
      doc.sourceLines.push({ text: rawLine });
      continue;
    }
    const rel = REL_RE.exec(trimmed);
    if (rel) {
      ensure(rel[1]);
      ensure(rel[5]);
      const r: ErRelationship = {
        id: `r${++counter}`,
        left: rel[1],
        right: rel[5],
        leftCard: rel[2],
        rightCard: rel[4],
        identifying: rel[3] === "--",
        label: stripQuotes(rel[6].trim()),
        raw: rawLine,
      };
      doc.relationships.push(r);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "rel", id: r.id } });
      continue;
    }
    const block = BLOCK_OPEN_RE.exec(trimmed);
    if (block) {
      // Consume the whole attribute block verbatim (re-emitted unchanged).
      const blockLines = [rawLine];
      let closed = false;
      while (i + 1 < body.length) {
        i++;
        blockLines.push(body[i]);
        if (body[i].trim() === "}") {
          closed = true;
          break;
        }
      }
      if (!closed) {
        return { status: "code-only", reason: "unclosed entity block", diagnostics: [] };
      }
      const e = ensure(block[1]);
      e.blockRaw = blockLines;
      for (const bl of blockLines) doc.sourceLines.push({ text: bl });
      continue;
    }
    return {
      status: "code-only",
      reason: `unrecognized statement: "${trimmed.slice(0, 40)}"`,
      diagnostics: [],
    };
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing erDiagram header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function emitLabel(label: string): string {
  if (label === "") return '""';
  return /[\s:]/.test(label) ? `"${label.replace(/"/g, "'")}"` : label;
}

function relationshipLine(r: ErRelationship): string {
  const line = r.identifying ? "--" : "..";
  return `${r.left} ${r.leftCard}${line}${r.rightCard} ${r.right} : ${emitLabel(r.label)}`;
}

function serialize(doc: ErDoc): string {
  const out: string[] = [...doc.frontmatter];
  const relById = new Map(doc.relationships.map((r) => [r.id, r]));
  const emitted = new Set<string>();

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    if (line.ref.entity === "rel") {
      const r = relById.get(line.ref.id);
      if (!r) continue; // deleted
      emitted.add(r.id);
      out.push(r.dirty ? `${indent}${relationshipLine(r)}` : line.text);
      continue;
    }
    out.push(line.text);
  }

  const additions: string[] = [];
  for (const r of doc.relationships) {
    if (!emitted.has(r.id) && !r.raw) additions.push(`  ${relationshipLine(r)}`);
  }
  return [...out, ...additions].join("\n");
}

/** Mirror a cardinality token when reversing a relationship's direction. */
function mirrorCard(token: string): string {
  return token
    .split("")
    .reverse()
    .map((c) => (c === "{" ? "}" : c === "}" ? "{" : c))
    .join("");
}

function applyOp(doc: ErDoc, op: MermaidOp): ErDoc {
  const next = structuredClone(doc) as ErDoc;
  const eop = op as ErOp;
  const findRel = (id: string) => {
    const r = next.relationships.find((x) => x.id === id);
    if (!r) throw new MermaidOpError("That relationship no longer exists");
    return r;
  };

  switch (eop.type) {
    case "addRelationship": {
      if (!next.entities.some((e) => e.id === eop.left) || !next.entities.some((e) => e.id === eop.right)) {
        throw new MermaidOpError("Both entities must already exist");
      }
      next.relationships.push({
        id: `r_a${next.relationships.length + 1}`,
        left: eop.left,
        right: eop.right,
        leftCard: "||",
        rightCard: "o{",
        identifying: true,
        label: eop.label ?? "relates to",
        added: true,
      });
      return next;
    }
    case "setRelationshipLabel": {
      const r = findRel(eop.id);
      r.label = eop.label;
      r.dirty = true;
      return next;
    }
    case "setRelationshipCardinality": {
      const r = findRel(eop.id);
      if (eop.leftCard !== undefined) r.leftCard = eop.leftCard;
      if (eop.rightCard !== undefined) r.rightCard = eop.rightCard;
      if (eop.identifying !== undefined) r.identifying = eop.identifying;
      r.dirty = true;
      return next;
    }
    case "reverseRelationship": {
      const r = findRel(eop.id);
      const newLeft = mirrorCard(r.rightCard);
      const newRight = mirrorCard(r.leftCard);
      [r.left, r.right] = [r.right, r.left];
      r.leftCard = newLeft;
      r.rightCard = newRight;
      r.dirty = true;
      return next;
    }
    case "deleteRelationship": {
      findRel(eop.id);
      next.relationships = next.relationships.filter((r) => r.id !== eop.id);
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for ER diagrams");
  }
}

export const erAdapter: MermaidAdapter<ErDoc> = {
  diagramType: "er",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Entity", addNode: "Add entity", edge: "Relationship" },
};
