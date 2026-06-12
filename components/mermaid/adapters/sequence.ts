/**
 * Sequence adapter. Messages and participants edit per-line; blocks (loop,
 * alt, notes, activations) are locked passthrough rows preserved verbatim.
 * Reorders and inserts regenerate the body wholesale (content-preserving).
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type MermaidOp, type SequenceOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type {
  ParseOutcome,
  SequenceArrow,
  SequenceDoc,
  SequenceItem,
  SequenceParticipant,
} from "../model/types";

const ARROWS: SequenceArrow[] = ["-->>", "->>", "--x", "-x", "--)", "-)", "-->", "->"];
const MESSAGE_RE = new RegExp(
  `^([A-Za-z0-9_]+)\\s*(${ARROWS.map((a) => a.replace(/[-)>(x]/g, (c) => `\\${c}`)).join("|")})\\s*([A-Za-z0-9_]+)\\s*:\\s*(.*)$`,
);
const PARTICIPANT_RE = /^(participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/;
const BLOCK_RE = /^(note\b|loop\b|alt\b|else\b|opt\b|par\b|and\b|critical\b|option\b|break\b|rect\b|end\s*$|activate\b|deactivate\b|box\b|create\b|destroy\b|link\b|links\b|properties\b|title\b|autonumber\s+\S)/i;

type SeqDoc = SequenceDoc & { regenerateAll?: boolean };

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: SeqDoc = {
    kind: "sequence",
    diagramType: "sequence",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    autonumber: false,
    participants: [],
    items: [],
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
      if (!/^sequenceDiagram\s*$/.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized sequence header", diagnostics: [] };
      }
      headerSeen = true;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    if (/^autonumber\s*$/.test(trimmed)) {
      doc.autonumber = true;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "autonumber", id: "autonumber" } });
      continue;
    }
    const participant = PARTICIPANT_RE.exec(trimmed);
    if (participant) {
      const p: SequenceParticipant = {
        id: participant[2],
        alias: participant[3]?.trim(),
        isActor: participant[1] === "actor",
        raw: rawLine,
      };
      doc.participants.push(p);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "participant", id: p.id } });
      continue;
    }
    const message = MESSAGE_RE.exec(trimmed);
    // Activation shorthand (A->>+B:) stays a locked row — regenerating it
    // would silently drop the activation marker.
    if (message && !/[+-]\s*:/.test(trimmed.split(":")[0] + ":")) {
      const item: SequenceItem = {
        kind: "message",
        id: `s${++counter}`,
        from: message[1],
        to: message[3],
        text: message[4],
        arrow: message[2] as SequenceArrow,
        raw: rawLine,
      };
      doc.items.push(item);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "item", id: item.id } });
      continue;
    }
    if (BLOCK_RE.test(trimmed) || message) {
      const item: SequenceItem = { kind: "passthrough", id: `s${++counter}`, raw: rawLine };
      doc.items.push(item);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "item", id: item.id } });
      continue;
    }
    return {
      status: "code-only",
      reason: `unrecognized statement: "${trimmed.slice(0, 40)}"`,
      diagnostics: [],
    };
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing sequenceDiagram header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function participantLine(p: SequenceParticipant): string {
  const kind = p.isActor ? "actor" : "participant";
  return p.alias ? `${kind} ${p.id} as ${p.alias}` : `${kind} ${p.id}`;
}

function messageLine(item: Extract<SequenceItem, { kind: "message" }>): string {
  return `${item.from}${item.arrow}${item.to}: ${item.text}`;
}

function serialize(doc: SequenceDoc): string {
  const sdoc = doc as SeqDoc;
  const out: string[] = [...doc.frontmatter];

  if (sdoc.regenerateAll) {
    const comments = doc.sourceLines
      .filter((l) => !l.ref && l.text.trim().startsWith("%%"))
      .map((l) => l.text);
    out.push("sequenceDiagram", ...comments);
    if (doc.autonumber) out.push("  autonumber");
    for (const p of doc.participants) out.push(`  ${participantLine(p)}`);
    for (const item of doc.items) {
      if (item.kind === "passthrough") out.push(item.raw);
      else out.push(`  ${messageLine(item)}`);
    }
    return out.join("\n");
  }

  const participantById = new Map(doc.participants.map((p) => [p.id, p]));
  const itemById = new Map(doc.items.map((i) => [i.id, i]));
  const emittedParticipants = new Set<string>();
  const emittedItems = new Set<string>();

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    switch (line.ref.entity) {
      case "autonumber":
        if (doc.autonumber) out.push(line.text);
        break;
      case "participant": {
        const p = participantById.get(line.ref.id);
        if (!p) break;
        emittedParticipants.add(p.id);
        out.push(p.dirty ? `${indent}${participantLine(p)}` : line.text);
        break;
      }
      case "item": {
        const item = itemById.get(line.ref.id);
        if (!item) break;
        emittedItems.add(item.id);
        if (item.kind === "passthrough" || !item.dirty) out.push(line.text);
        else out.push(`${indent}${messageLine(item)}`);
        break;
      }
      default:
        out.push(line.text);
    }
  }

  const additions: string[] = [];
  if (doc.autonumber && !doc.sourceLines.some((l) => l.ref?.entity === "autonumber")) {
    additions.push("  autonumber");
  }
  for (const p of doc.participants) {
    if (!emittedParticipants.has(p.id) && !p.raw) additions.push(`  ${participantLine(p)}`);
  }
  for (const item of doc.items) {
    if (item.kind === "message" && !emittedItems.has(item.id) && !item.raw) {
      additions.push(`  ${messageLine(item)}`);
    }
  }
  return [...out, ...additions].join("\n");
}

function applyOp(doc: SequenceDoc, op: MermaidOp): SequenceDoc {
  const next = structuredClone(doc) as SeqDoc;
  const sop = op as SequenceOp;
  const participant = (id: string) => {
    const p = next.participants.find((x) => x.id === id);
    if (!p) throw new MermaidOpError("That participant no longer exists");
    return p;
  };
  const message = (id: string) => {
    const m = next.items.find((x) => x.id === id);
    if (!m || m.kind !== "message") throw new MermaidOpError("That message no longer exists");
    return m;
  };

  switch (sop.type) {
    case "addParticipant": {
      const base = sop.label.replace(/[^A-Za-z0-9_]/g, "") || "P";
      let id = base;
      let n = 1;
      while (next.participants.some((p) => p.id === id)) id = `${base}${++n}`;
      next.participants.push({
        id,
        alias: sop.label === id ? undefined : sop.label,
        isActor: Boolean(sop.isActor),
      });
      return next;
    }
    case "renameParticipant": {
      const p = participant(sop.id);
      p.alias = sop.label === p.id ? undefined : sop.label;
      p.dirty = true;
      return next;
    }
    case "deleteParticipant": {
      participant(sop.id);
      const used = next.items.some(
        (i) => i.kind === "message" && (i.from === sop.id || i.to === sop.id),
      );
      if (used) {
        throw new MermaidOpError("Remove this participant's messages first");
      }
      next.participants = next.participants.filter((p) => p.id !== sop.id);
      next.regenerateAll = true;
      return next;
    }
    case "addMessage": {
      participant(sop.from);
      participant(sop.to);
      next.items.push({
        kind: "message",
        id: `s_a${next.items.length + 1}`,
        from: sop.from,
        to: sop.to,
        text: sop.text,
        arrow: sop.arrow ?? "->>",
      });
      return next;
    }
    case "editMessage": {
      const m = message(sop.id);
      if (sop.from) m.from = sop.from;
      if (sop.to) m.to = sop.to;
      if (sop.text !== undefined) m.text = sop.text;
      if (sop.arrow) m.arrow = sop.arrow;
      m.dirty = true;
      return next;
    }
    case "deleteMessage": {
      message(sop.id);
      next.items = next.items.filter((i) => i.id !== sop.id);
      return next;
    }
    case "moveMessage": {
      const idx = next.items.findIndex((i) => i.id === sop.id);
      if (idx === -1) throw new MermaidOpError("That message no longer exists");
      const target = sop.direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.items.length) return next;
      [next.items[idx], next.items[target]] = [next.items[target], next.items[idx]];
      next.regenerateAll = true;
      return next;
    }
    case "setAutonumber": {
      next.autonumber = sop.enabled;
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for sequence diagrams");
  }
}

export const sequenceAdapter: MermaidAdapter<SequenceDoc> = {
  diagramType: "sequence",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Participant", addNode: "Add participant", edge: "Message" },
};
