/**
 * State diagram adapter (flat stateDiagram / stateDiagram-v2).
 *
 * Supports transitions (`A --> B : label`) and state descriptions
 * (`A : desc` or `state "desc" as A`). Composite states (`{ … }`), notes,
 * concurrency (`--`), and fork/choice/join (`<<…>>`) are NOT structurally
 * editable — like flowchart's nested-subgraph rule, those downgrade the whole
 * document to code-only rather than risk guessing.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type MermaidOp, type StateOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { ParseOutcome, StateDoc, StateNode, StateTransition } from "../model/types";

const HEADER_RE = /^stateDiagram(-v2)?\s*$/;
const TRANSITION_RE = /^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)\s*(?::\s*(.*))?$/;
const ALIAS_RE = /^state\s+"([^"]*)"\s+as\s+(\w+)\s*$/;
const DECL_RE = /^state\s+(\w+)\s*$/;
const DESC_RE = /^(\w+)\s*:\s*(.+)$/;
const BARE_RE = /^\w+$/;
const DIRECTION_RE = /^direction\s+\w+\s*$/;

type StateNodeX = StateNode & { hasLine?: boolean; descForm?: "alias" | "colon" };

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const doc: StateDoc & { states: StateNodeX[] } = {
    kind: "state",
    diagramType: "state",
    frontmatter: lines.slice(0, bodyStartIndex),
    sourceLines: [],
    warnings: [],
    header: "stateDiagram-v2",
    states: [],
    transitions: [],
  };

  const byId = new Map<string, StateNodeX>();
  const ensure = (id: string): StateNodeX => {
    let node = byId.get(id);
    if (!node) {
      node = { id };
      byId.set(id, node);
      doc.states.push(node);
    }
    return node;
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
      if (!HEADER_RE.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized state diagram header", diagnostics: [] };
      }
      headerSeen = true;
      doc.header = trimmed;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    // Constructs we will not edit structurally — downgrade the whole document.
    if (
      trimmed.includes("{") ||
      trimmed.includes("}") ||
      trimmed.includes("<<") ||
      trimmed === "--" ||
      /^note\b/.test(trimmed)
    ) {
      return { status: "code-only", reason: "uses composite states, notes, or forks", diagnostics: [] };
    }
    if (DIRECTION_RE.test(trimmed)) {
      doc.sourceLines.push({ text: rawLine }); // verbatim, not editable
      continue;
    }
    const tr = TRANSITION_RE.exec(trimmed);
    if (tr) {
      const from = tr[1];
      const to = tr[2];
      if (from !== "[*]") ensure(from);
      if (to !== "[*]") ensure(to);
      const t: StateTransition = {
        id: `st${++counter}`,
        from,
        to,
        label: tr[3]?.trim() || undefined,
        raw: rawLine,
      };
      doc.transitions.push(t);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "transition", id: t.id } });
      continue;
    }
    const alias = ALIAS_RE.exec(trimmed);
    if (alias) {
      const node = ensure(alias[2]);
      node.description = alias[1];
      node.descForm = "alias";
      node.hasLine = true;
      node.raw = rawLine;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "stateLine", id: node.id } });
      continue;
    }
    const decl = DECL_RE.exec(trimmed);
    if (decl) {
      const node = ensure(decl[1]);
      node.hasLine = true;
      node.raw = rawLine;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "stateLine", id: node.id } });
      continue;
    }
    const desc = DESC_RE.exec(trimmed);
    if (desc) {
      const node = ensure(desc[1]);
      node.description = desc[2].trim();
      node.descForm = "colon";
      node.hasLine = true;
      node.raw = rawLine;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "stateLine", id: node.id } });
      continue;
    }
    if (BARE_RE.test(trimmed)) {
      const node = ensure(trimmed);
      node.hasLine = true;
      node.raw = rawLine;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "stateLine", id: node.id } });
      continue;
    }
    return {
      status: "code-only",
      reason: `unrecognized statement: "${trimmed.slice(0, 40)}"`,
      diagnostics: [],
    };
  }

  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing state diagram header", severity: "error" }] };
  }
  return { status: "ok", doc };
}

function stateLineText(node: StateNodeX): string {
  if (node.description !== undefined) {
    return node.descForm === "alias"
      ? `state "${node.description}" as ${node.id}`
      : `${node.id} : ${node.description}`;
  }
  return node.id;
}

function transitionLine(t: StateTransition): string {
  return t.label ? `${t.from} --> ${t.to} : ${t.label}` : `${t.from} --> ${t.to}`;
}

function serialize(doc: StateDoc): string {
  const out: string[] = [...doc.frontmatter];
  const states = doc.states as StateNodeX[];
  const stateById = new Map(states.map((s) => [s.id, s]));
  const transitionById = new Map(doc.transitions.map((t) => [t.id, t]));
  const emittedState = new Set<string>();
  const emittedTransition = new Set<string>();

  for (const line of doc.sourceLines) {
    const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    switch (line.ref.entity) {
      case "transition": {
        const t = transitionById.get(line.ref.id);
        if (!t) break;
        emittedTransition.add(t.id);
        out.push(t.dirty ? `${indent}${transitionLine(t)}` : line.text);
        break;
      }
      case "stateLine": {
        const node = stateById.get(line.ref.id);
        if (!node) break; // deleted
        emittedState.add(node.id);
        out.push(node.dirty ? `${indent}${stateLineText(node)}` : line.text);
        break;
      }
      default:
        out.push(line.text);
    }
  }

  const additions: string[] = [];
  // Added transitions, and a described/declared state that has no source line.
  for (const node of states) {
    if (emittedState.has(node.id)) continue;
    if (node.added || (node.dirty && node.description !== undefined)) {
      additions.push(`  ${stateLineText(node)}`);
    }
  }
  for (const t of doc.transitions) {
    if (!emittedTransition.has(t.id) && !t.raw) additions.push(`  ${transitionLine(t)}`);
  }
  return [...out, ...additions].join("\n");
}

function applyOp(doc: StateDoc, op: MermaidOp): StateDoc {
  const next = structuredClone(doc) as StateDoc & { states: StateNodeX[] };
  const sop = op as StateOp;
  const findState = (id: string) => {
    const s = next.states.find((x) => x.id === id);
    if (!s) throw new MermaidOpError("That state no longer exists");
    return s;
  };
  const findTransition = (id: string) => {
    const t = next.transitions.find((x) => x.id === id);
    if (!t) throw new MermaidOpError("That transition no longer exists");
    return t;
  };

  switch (sop.type) {
    case "addState": {
      const id = sop.name.trim();
      if (!/^\w+$/.test(id)) throw new MermaidOpError("State names must be a single word (letters, digits, _)");
      if (next.states.some((s) => s.id === id)) throw new MermaidOpError("A state with that name already exists");
      next.states.push({ id, added: true });
      return next;
    }
    case "setStateDescription": {
      const s = findState(sop.id);
      s.description = sop.description || undefined;
      s.dirty = true;
      return next;
    }
    case "deleteState": {
      findState(sop.id);
      next.states = next.states.filter((s) => s.id !== sop.id);
      next.transitions = next.transitions.filter((t) => t.from !== sop.id && t.to !== sop.id);
      return next;
    }
    case "addTransition": {
      next.transitions.push({
        id: `st_a${next.transitions.length + 1}`,
        from: sop.from,
        to: sop.to,
        label: sop.label?.trim() || undefined,
        added: true,
      });
      return next;
    }
    case "setTransitionLabel": {
      const t = findTransition(sop.id);
      t.label = sop.label.trim() || undefined;
      t.dirty = true;
      return next;
    }
    case "reverseTransition": {
      const t = findTransition(sop.id);
      [t.from, t.to] = [t.to, t.from];
      t.dirty = true;
      return next;
    }
    case "deleteTransition": {
      findTransition(sop.id);
      next.transitions = next.transitions.filter((t) => t.id !== sop.id);
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for state diagrams");
  }
}

export const stateAdapter: MermaidAdapter<StateDoc> = {
  diagramType: "state",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "State", addNode: "Add state", edge: "Transition" },
};
