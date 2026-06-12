/**
 * Mindmap adapter — indentation-tree parse / serialize / ops.
 *
 * Label edits regenerate single lines in place. Structural ops (add / delete /
 * indent / outdent / move) regenerate the whole tree body with normalized
 * 2-space indentation — content-preserving (labels, shapes, ::icon decorators
 * and comments are all re-emitted), formatting-normalizing, and only ever
 * after the fidelity gate has passed on the untouched document.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type MermaidOp, type MindmapOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type { MindmapDoc, MindmapNode, MindmapShape, ParseOutcome } from "../model/types";

const SHAPE_WRAPPERS: Array<[MindmapShape, string, string]> = [
  ["bang", "))", "(("],
  ["circle", "((", "))"],
  ["cloud", ")", "("],
  ["hexagon", "{{", "}}"],
  ["square", "[", "]"],
  ["rounded", "(", ")"],
];

interface ParsedToken {
  declId?: string;
  label: string;
  shape: MindmapShape;
}

function parseToken(token: string): ParsedToken {
  const idMatch = /^([A-Za-z][A-Za-z0-9_-]*)(?=\(|\[|\)|\{)/.exec(token);
  const declId = idMatch?.[1];
  const rest = declId ? token.slice(declId.length) : token;
  for (const [shape, open, close] of SHAPE_WRAPPERS) {
    if (rest.startsWith(open) && rest.endsWith(close) && rest.length > open.length + close.length - 1) {
      return { declId, label: rest.slice(open.length, rest.length - close.length).trim(), shape };
    }
  }
  return { label: token.trim(), shape: "default" };
}

function wrapToken(node: MindmapNode & { declId?: string }): string {
  const id = node.declId ?? "";
  for (const [shape, open, close] of SHAPE_WRAPPERS) {
    if (shape === node.shape) return `${id}${open}${node.label}${close}`;
  }
  return node.label;
}

type MNode = MindmapNode & { declId?: string; indent?: number };

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const frontmatter = lines.slice(0, bodyStartIndex);
  const body = lines.slice(bodyStartIndex);

  const doc: MindmapDoc = {
    kind: "mindmap",
    diagramType: "mindmap",
    frontmatter,
    sourceLines: [],
    warnings: [],
    root: { id: "m0", label: "", shape: "default", decorators: [], children: [] },
  };

  let headerSeen = false;
  let counter = 0;
  const stack: MNode[] = [];
  let rootSet = false;

  for (let li = 0; li < body.length; li++) {
    const rawLine = body[li];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("%%")) {
      doc.sourceLines.push({ text: rawLine });
      continue;
    }
    if (!headerSeen) {
      if (!/^mindmap\s*$/.test(trimmed)) {
        return { status: "code-only", reason: "unrecognized mindmap header", diagnostics: [] };
      }
      headerSeen = true;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }
    if (trimmed.startsWith("::icon")) {
      const owner = stack[stack.length - 1];
      if (!owner) {
        return { status: "code-only", reason: "icon decorator before any node", diagnostics: [] };
      }
      owner.decorators.push(trimmed);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "decorator", id: owner.id } });
      continue;
    }

    const indent = (/^(\s*)/.exec(rawLine)?.[1] ?? "").length;
    const token = parseToken(trimmed);
    const node: MNode = {
      id: `m${++counter}`,
      label: token.label,
      shape: token.shape,
      declId: token.declId,
      decorators: [],
      children: [],
      raw: rawLine,
      indent,
    };

    while (stack.length > 0 && (stack[stack.length - 1].indent ?? 0) >= indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      if (rootSet) {
        return { status: "code-only", reason: "mindmaps support a single root", diagnostics: [] };
      }
      doc.root = node;
      rootSet = true;
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
    doc.sourceLines.push({ text: rawLine, ref: { entity: "node", id: node.id } });
  }

  if (!headerSeen || !rootSet) {
    return {
      status: "invalid",
      diagnostics: [{ line: 1, message: "missing mindmap content", severity: "error" }],
    };
  }
  return { status: "ok", doc };
}

function collectNodes(root: MNode): Map<string, MNode> {
  const map = new Map<string, MNode>();
  const walk = (n: MNode) => {
    map.set(n.id, n);
    n.children.forEach((c) => walk(c as MNode));
  };
  walk(root);
  return map;
}

function findParent(root: MNode, id: string): MNode | null {
  let found: MNode | null = null;
  const walk = (n: MNode) => {
    for (const c of n.children) {
      if (c.id === id) found = n;
      walk(c as MNode);
    }
  };
  walk(root);
  return found;
}

function serialize(doc: MindmapDoc): string {
  const out: string[] = [...doc.frontmatter];
  const nodeById = collectNodes(doc.root as MNode);

  if (doc.regenerateAll) {
    // Comments are content: re-emit any banked comment lines after the header.
    const comments = doc.sourceLines
      .filter((l) => !l.ref && l.text.trim().startsWith("%%"))
      .map((l) => l.text);
    const headerLine = doc.sourceLines.find((l) => l.ref?.entity === "header")?.text ?? "mindmap";
    out.push(headerLine, ...comments);
    const emit = (node: MNode, depth: number) => {
      const indent = "  ".repeat(depth + 1);
      out.push(`${indent}${wrapToken(node)}`);
      for (const d of node.decorators) out.push(`${indent}${d}`);
      node.children.forEach((c) => emit(c as MNode, depth + 1));
    };
    emit(doc.root as MNode, 0);
    return out.join("\n");
  }

  for (const line of doc.sourceLines) {
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    if (line.ref.entity === "node") {
      const node = nodeById.get(line.ref.id);
      if (!node) continue; // deleted (label-only path never deletes, safe)
      const indent = /^(\s*)/.exec(line.text)?.[1] ?? "";
      out.push(node.dirty ? `${indent}${wrapToken(node)}` : line.text);
      continue;
    }
    out.push(line.text); // header, decorators
  }
  return out.join("\n");
}

function applyOp(doc: MindmapDoc, op: MermaidOp): MindmapDoc {
  const next = structuredClone(doc);
  const mop = op as MindmapOp;
  const root = next.root as MNode;
  const nodeById = collectNodes(root);
  const get = (id: string) => {
    const n = nodeById.get(id);
    if (!n) throw new MermaidOpError("That topic no longer exists");
    return n;
  };
  let counter = nodeById.size;

  switch (mop.type) {
    case "renameNode": {
      const n = get(mop.id);
      n.label = mop.label;
      n.dirty = true;
      return next;
    }
    case "setShape": {
      const n = get(mop.id);
      n.shape = mop.shape;
      n.dirty = true;
      return next;
    }
    case "addChild": {
      const parent = get(mop.parentId);
      parent.children.push({
        id: `m_a${++counter}`,
        label: mop.label,
        shape: "default",
        decorators: [],
        children: [],
      });
      next.regenerateAll = true;
      return next;
    }
    case "deleteNode": {
      if (mop.id === root.id) throw new MermaidOpError("The central idea can't be deleted");
      const parent = findParent(root, mop.id);
      if (!parent) throw new MermaidOpError("That topic no longer exists");
      parent.children = parent.children.filter((c) => c.id !== mop.id);
      next.regenerateAll = true;
      return next;
    }
    case "indent": {
      const parent = findParent(root, mop.id);
      if (!parent) throw new MermaidOpError("That topic no longer exists");
      const idx = parent.children.findIndex((c) => c.id === mop.id);
      if (idx <= 0) throw new MermaidOpError("Nothing above to nest under");
      const node = parent.children[idx];
      parent.children.splice(idx, 1);
      parent.children[idx - 1].children.push(node);
      next.regenerateAll = true;
      return next;
    }
    case "outdent": {
      const parent = findParent(root, mop.id);
      if (!parent) throw new MermaidOpError("That topic no longer exists");
      if (parent.id === root.id) throw new MermaidOpError("Already at the top level");
      const grandparent = findParent(root, parent.id);
      if (!grandparent) throw new MermaidOpError("Already at the top level");
      const idx = parent.children.findIndex((c) => c.id === mop.id);
      const node = parent.children[idx];
      parent.children.splice(idx, 1);
      const parentIdx = grandparent.children.findIndex((c) => c.id === parent.id);
      grandparent.children.splice(parentIdx + 1, 0, node);
      next.regenerateAll = true;
      return next;
    }
    case "moveBefore": {
      const parent = findParent(root, mop.id);
      const siblingParent = findParent(root, mop.siblingId);
      if (!parent || !siblingParent || parent.id !== siblingParent.id) {
        throw new MermaidOpError("Topics can only be reordered among siblings");
      }
      const node = parent.children.find((c) => c.id === mop.id);
      if (!node) throw new MermaidOpError("That topic no longer exists");
      parent.children = parent.children.filter((c) => c.id !== mop.id);
      const target = parent.children.findIndex((c) => c.id === mop.siblingId);
      parent.children.splice(target, 0, node);
      next.regenerateAll = true;
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for mind maps");
  }
}

export const mindmapAdapter: MermaidAdapter<MindmapDoc> = {
  diagramType: "mindmap",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Topic", addNode: "Add topic" },
};
