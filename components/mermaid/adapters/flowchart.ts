/**
 * Flowchart adapter — tolerant line-based parse / lossless serialize / ops.
 *
 * Fidelity strategy: every body line is kept in order (SourceLine). Lines
 * bound to entities re-emit verbatim unless the entity is dirty (regenerate,
 * preserving indentation) or deleted (skip). Unrecognized lines that could
 * plausibly be structural force `code-only` — never guess.
 */

import { splitFrontmatter } from "../diagram-type";
import { MermaidOpError, type FlowchartOp, type MermaidOp } from "../model/ops";
import type { MermaidAdapter } from "../model/adapter";
import type {
  Diagnostic,
  FlowDirection,
  FlowEdge,
  FlowEdgeStyle,
  FlowNode,
  FlowShape,
  FlowSubgraph,
  FlowchartDoc,
  ParseOutcome,
  SourceLine,
} from "../model/types";

// ─── Shape brackets ─────────────────────────────────────────────────────────

const SHAPE_BRACKETS: Record<FlowShape, [string, string]> = {
  stadium: ["([", "])"],
  subroutine: ["[[", "]]"],
  cylinder: ["[(", ")]"],
  circle: ["((", "))"],
  hexagon: ["{{", "}}"],
  rect: ["[", "]"],
  rounded: ["(", ")"],
  diamond: ["{", "}"],
};

// Longest-first so `([` wins over `[`.
const OPEN_TOKENS: Array<[string, FlowShape]> = [
  ["([", "stadium"],
  ["[[", "subroutine"],
  ["[(", "cylinder"],
  ["((", "circle"],
  ["{{", "hexagon"],
  ["[", "rect"],
  ["(", "rounded"],
  ["{", "diamond"],
];

/** Adapter-owned color palette — emitted as classDef mmdp_<key> lines. */
export const FLOW_PALETTE: Record<string, { classDef: string; swatch: string; label: string }> = {
  blue: { classDef: "fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a", swatch: "#3b82f6", label: "Blue" },
  green: { classDef: "fill:#dcfce7,stroke:#22c55e,color:#14532d", swatch: "#22c55e", label: "Green" },
  amber: { classDef: "fill:#fef3c7,stroke:#f59e0b,color:#78350f", swatch: "#f59e0b", label: "Amber" },
  rose: { classDef: "fill:#ffe4e6,stroke:#f43f5e,color:#881337", swatch: "#f43f5e", label: "Rose" },
  violet: { classDef: "fill:#ede9fe,stroke:#8b5cf6,color:#4c1d95", swatch: "#8b5cf6", label: "Violet" },
  slate: { classDef: "fill:#f1f5f9,stroke:#64748b,color:#0f172a", swatch: "#64748b", label: "Slate" },
};

const PALETTE_PREFIX = "mmdp_";

const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const HEADER_RE = /^(flowchart|graph)\s+(TB|TD|LR|RL|BT)\s*$/;
const PASSTHROUGH_RE = /^(classDef\b|class\b|linkStyle\b|style\b|click\b|accTitle\b|accDescr\b|direction\s+(TB|TD|LR|RL|BT)\s*$)/;

// ─── Parsing helpers ────────────────────────────────────────────────────────

interface ParsedNodeToken {
  id: string;
  label?: string;
  shape?: FlowShape;
  paletteKey?: string;
  extraClasses: string[];
}

/** Parse a single node token: `id`, `id[label]`, `id(["x"]):::cls`, … */
function parseNodeToken(token: string): ParsedNodeToken | null {
  let rest = token.trim();
  const classes: string[] = [];
  // :::class suffixes (mermaid allows one; tolerate repeats)
  for (;;) {
    const m = /^(.*?):::([A-Za-z][A-Za-z0-9_-]*)$/.exec(rest);
    if (!m) break;
    classes.unshift(m[2]);
    rest = m[1].trim();
  }
  let paletteKey: string | undefined;
  const extraClasses: string[] = [];
  for (const c of classes) {
    if (c.startsWith(PALETTE_PREFIX) && FLOW_PALETTE[c.slice(PALETTE_PREFIX.length)]) {
      paletteKey = c.slice(PALETTE_PREFIX.length);
    } else {
      extraClasses.push(c);
    }
  }

  const idMatch = /^([A-Za-z][A-Za-z0-9_-]*)/.exec(rest);
  if (!idMatch) return null;
  const id = idMatch[1];
  let after = rest.slice(id.length);
  if (!after.trim()) {
    return { id, extraClasses, paletteKey };
  }
  after = after.trim();
  for (const [open, shape] of OPEN_TOKENS) {
    if (after.startsWith(open)) {
      const close = SHAPE_BRACKETS[shape][1];
      if (!after.endsWith(close)) return null;
      let label = after.slice(open.length, after.length - close.length).trim();
      if (label.startsWith('"') && label.endsWith('"') && label.length >= 2) {
        label = label.slice(1, -1);
      }
      return { id, label, shape, paletteKey, extraClasses };
    }
  }
  return null;
}

interface Connector {
  style: FlowEdgeStyle;
  label?: string;
}

/**
 * Depth/quote-aware scan of an edge line into node tokens + connectors.
 * Returns null when the line doesn't contain a top-level connector or uses
 * syntax outside the tolerated subset (caller downgrades to code-only).
 */
function scanEdgeLine(line: string): { tokens: string[]; connectors: Connector[] } | null {
  const tokens: string[] = [];
  const connectors: Connector[] = [];
  let buf = "";
  let depth = 0;
  let inQuote = false;
  let i = 0;

  const tryConnector = (): Connector | null => {
    const rest = line.slice(i);
    let m: RegExpExecArray | null;
    // Label-infix forms first: `-- label -->`, `-. label .->`, `== label ==>`
    if ((m = /^--\s+([^>]*?)\s+--+>/.exec(rest))) {
      i += m[0].length;
      return { style: "arrow", label: m[1].trim() };
    }
    if ((m = /^-\.\s+(.*?)\s+\.->/.exec(rest))) {
      i += m[0].length;
      return { style: "dotted", label: m[1].trim() };
    }
    if ((m = /^==\s+(.*?)\s+==+>/.exec(rest))) {
      i += m[0].length;
      return { style: "thick", label: m[1].trim() };
    }
    // Plain connectors (longest first)
    if ((m = /^-\.+->/.exec(rest))) {
      i += m[0].length;
      return { style: "dotted" };
    }
    if ((m = /^={2,}>/.exec(rest))) {
      i += m[0].length;
      return { style: "thick" };
    }
    if ((m = /^-{2,}>/.exec(rest))) {
      i += m[0].length;
      return { style: "arrow" };
    }
    if ((m = /^-{3,}(?!>)/.exec(rest))) {
      i += m[0].length;
      return { style: "open" };
    }
    return null;
  };

  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      buf += ch;
      if (ch === '"') inQuote = false;
      i++;
      continue;
    }
    if (ch === '"') {
      buf += ch;
      inQuote = true;
      i++;
      continue;
    }
    if ("[({".includes(ch)) depth++;
    if ("])}".includes(ch)) depth--;
    if (depth === 0 && (ch === "-" || ch === "=")) {
      const conn = tryConnector();
      if (conn) {
        if (!buf.trim()) return null;
        tokens.push(buf.trim());
        buf = "";
        // Optional |label| after the connector
        const labelMatch = /^\s*\|([^|]*)\|/.exec(line.slice(i));
        if (labelMatch) {
          conn.label = labelMatch[1].trim();
          i += labelMatch[0].length;
        }
        connectors.push(conn);
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (inQuote || depth !== 0) return null;
  if (connectors.length === 0) return null;
  if (!buf.trim()) return null;
  tokens.push(buf.trim());
  if (tokens.length !== connectors.length + 1) return null;
  return { tokens, connectors };
}

/** Depth/quote-aware split of a node segment on top-level `&` (fanout). */
function splitFanout(segment: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let inQuote = false;
  for (const ch of segment) {
    if (inQuote) {
      buf += ch;
      if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') {
      buf += ch;
      inQuote = true;
      continue;
    }
    if ("[({".includes(ch)) depth++;
    if ("])}".includes(ch)) depth--;
    if (ch === "&" && depth === 0) {
      parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  parts.push(buf.trim());
  return parts.filter(Boolean);
}

// ─── Parse ──────────────────────────────────────────────────────────────────

function parse(source: string): ParseOutcome {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const frontmatter = lines.slice(0, bodyStartIndex);
  const body = lines.slice(bodyStartIndex);

  const doc: FlowchartDoc = {
    kind: "flowchart",
    diagramType: "flowchart",
    direction: "TB",
    frontmatter,
    sourceLines: [],
    warnings: [],
    nodes: [],
    edges: [],
    subgraphs: [],
    edgeGroups: {},
  };

  const nodeById = new Map<string, FlowNode>();
  let edgeCounter = 0;
  let groupCounter = 0;
  let headerSeen = false;
  let currentSubgraph: FlowSubgraph | null = null;
  let subgraphDepth = 0;
  const diagnostics: Diagnostic[] = [];

  const ensureNode = (
    token: ParsedNodeToken,
    rawLineForDecl: string | null,
  ): FlowNode => {
    let node = nodeById.get(token.id);
    if (!node) {
      node = {
        id: token.id,
        label: token.label ?? token.id,
        shape: token.shape ?? "rect",
        paletteKey: token.paletteKey,
        extraClasses: token.extraClasses.length ? token.extraClasses : undefined,
        raw: rawLineForDecl ?? undefined,
      };
      doc.nodes.push(node);
      nodeById.set(node.id, node);
    } else if (token.label !== undefined) {
      // Later declaration wins for label/shape (mermaid behavior).
      node.label = token.label;
      if (token.shape) node.shape = token.shape;
      if (token.paletteKey) node.paletteKey = token.paletteKey;
      if (token.extraClasses.length) node.extraClasses = token.extraClasses;
      if (rawLineForDecl) node.raw = rawLineForDecl;
    }
    if (currentSubgraph && !currentSubgraph.nodeIds.includes(node.id)) {
      currentSubgraph.nodeIds.push(node.id);
    }
    return node;
  };

  const codeOnly = (lineNo: number, reason: string): ParseOutcome => ({
    status: "code-only",
    reason,
    diagnostics: [
      ...diagnostics,
      { line: lineNo, message: reason, severity: "warning" },
    ],
  });

  for (let li = 0; li < body.length; li++) {
    const rawLine = body[li];
    const trimmed = rawLine.trim();
    const lineNo = bodyStartIndex + li + 1;

    // Verbatim lines: blanks, comments, recognized non-structural statements.
    if (!trimmed || trimmed.startsWith("%%") || PASSTHROUGH_RE.test(trimmed)) {
      doc.sourceLines.push({ text: rawLine });
      continue;
    }

    if (!headerSeen) {
      const header = HEADER_RE.exec(trimmed);
      if (!header) return codeOnly(lineNo, "unrecognized flowchart header");
      headerSeen = true;
      doc.direction = header[2] as FlowDirection;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "header", id: "header" } });
      continue;
    }

    if (/^subgraph\b/.test(trimmed)) {
      if (subgraphDepth >= 1) {
        return codeOnly(lineNo, "nested subgraphs aren't supported by structural editing yet");
      }
      let id: string;
      let title: string;
      const withBracket = /^subgraph\s+([A-Za-z][A-Za-z0-9_-]*)\s*\[(.+)\]\s*$/.exec(trimmed);
      if (withBracket) {
        id = withBracket[1];
        title = withBracket[2].trim().replace(/^"|"$/g, "");
      } else {
        const bare = /^subgraph\s+(.+)$/.exec(trimmed);
        if (!bare) return codeOnly(lineNo, "unrecognized subgraph syntax");
        title = bare[1].trim().replace(/^"|"$/g, "");
        id = title;
      }
      const subgraph: FlowSubgraph = { id, title, nodeIds: [], raw: rawLine };
      doc.subgraphs.push(subgraph);
      currentSubgraph = subgraph;
      subgraphDepth++;
      doc.sourceLines.push({ text: rawLine, ref: { entity: "subgraphOpen", id } });
      continue;
    }

    if (/^end\s*$/.test(trimmed)) {
      if (subgraphDepth === 0) {
        return codeOnly(lineNo, "unbalanced subgraph end");
      }
      subgraphDepth--;
      currentSubgraph = null;
      doc.sourceLines.push({ text: rawLine });
      continue;
    }

    // Edge line?
    const scan = scanEdgeLine(trimmed);
    if (scan) {
      const segments = scan.tokens.map(splitFanout);
      const parsedSegments: ParsedNodeToken[][] = [];
      for (const seg of segments) {
        const parsed: ParsedNodeToken[] = [];
        for (const tok of seg) {
          const p = parseNodeToken(tok);
          if (!p || !ID_RE.test(p.id)) {
            return codeOnly(lineNo, "edge syntax outside the supported subset");
          }
          parsed.push(p);
        }
        if (parsed.length === 0) {
          return codeOnly(lineNo, "edge syntax outside the supported subset");
        }
        parsedSegments.push(parsed);
      }

      const lineEdgeIds: string[] = [];
      for (let c = 0; c < scan.connectors.length; c++) {
        const fromTokens = parsedSegments[c];
        const toTokens = parsedSegments[c + 1];
        for (const ft of fromTokens) {
          const fromNode = ensureNode(ft, null);
          for (const tt of toTokens) {
            const toNode = ensureNode(tt, null);
            const edge: FlowEdge = {
              id: `e${++edgeCounter}`,
              from: fromNode.id,
              to: toNode.id,
              label: scan.connectors[c].label || undefined,
              style: scan.connectors[c].style,
              inlineFrom: ft.label !== undefined,
              inlineTo: tt.label !== undefined,
              raw: rawLine,
            };
            doc.edges.push(edge);
            lineEdgeIds.push(edge.id);
          }
        }
      }

      if (lineEdgeIds.length === 1) {
        doc.sourceLines.push({ text: rawLine, ref: { entity: "edge", id: lineEdgeIds[0] } });
      } else {
        const groupId = `g${++groupCounter}`;
        doc.edgeGroups[groupId] = lineEdgeIds;
        doc.sourceLines.push({ text: rawLine, ref: { entity: "edgeGroup", id: groupId } });
      }
      continue;
    }

    // Standalone node declaration?
    const nodeToken = parseNodeToken(trimmed);
    if (nodeToken && ID_RE.test(nodeToken.id) && nodeToken.label !== undefined) {
      ensureNode(nodeToken, rawLine);
      doc.sourceLines.push({ text: rawLine, ref: { entity: "node", id: nodeToken.id } });
      continue;
    }

    // Plausibly structural but unrecognized — never guess.
    return codeOnly(lineNo, `unrecognized statement: "${trimmed.slice(0, 40)}"`);
  }

  if (subgraphDepth !== 0) {
    return codeOnly(body.length, "unclosed subgraph");
  }
  if (!headerSeen) {
    return { status: "invalid", diagnostics: [{ line: 1, message: "missing flowchart header", severity: "error" }] };
  }

  doc.warnings = diagnostics;
  return { status: "ok", doc };
}

// ─── Serialize ──────────────────────────────────────────────────────────────

function quoteLabel(label: string): string {
  if (/[(){}[\];:#&|<>"]/.test(label) || /^\s|\s$/.test(label)) {
    return `"${label.replace(/"/g, "#quot;")}"`;
  }
  return label;
}

function nodeDecl(node: FlowNode): string {
  const [open, close] = SHAPE_BRACKETS[node.shape];
  const classes = [
    ...(node.paletteKey ? [`${PALETTE_PREFIX}${node.paletteKey}`] : []),
    ...(node.extraClasses ?? []),
  ];
  const suffix = classes.length ? `:::${classes.join(":::")}` : "";
  return `${node.id}${open}${quoteLabel(node.label)}${close}${suffix}`;
}

function connectorText(edge: FlowEdge): string {
  const label = edge.label ? `|${edge.label.replace(/\|/g, "/")}|` : "";
  switch (edge.style) {
    case "arrow":
      return `-->${label}`;
    case "dotted":
      return `-.->${label}`;
    case "thick":
      return `==>${label}`;
    case "open":
      return label ? `---${label}` : "---";
  }
}

function edgeLine(edge: FlowEdge, nodeById: Map<string, FlowNode>): string {
  const fromNode = nodeById.get(edge.from);
  const toNode = nodeById.get(edge.to);
  const fromToken = edge.inlineFrom && fromNode ? nodeDecl(fromNode) : edge.from;
  const toToken = edge.inlineTo && toNode ? nodeDecl(toNode) : edge.to;
  return `${fromToken} ${connectorText(edge)} ${toToken}`;
}

function indentOf(text: string): string {
  return /^(\s*)/.exec(text)?.[1] ?? "";
}

function serialize(doc: FlowchartDoc): string {
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(doc.edges.map((e) => [e.id, e]));
  const subgraphById = new Map(doc.subgraphs.map((s) => [s.id, s]));
  const emittedNodeIds = new Set<string>();
  const emittedEdgeIds = new Set<string>();

  const edgeNeedsRegen = (edge: FlowEdge): boolean => {
    if (edge.dirty) return true;
    if (edge.inlineFrom && nodeById.get(edge.from)?.dirty) return true;
    if (edge.inlineTo && nodeById.get(edge.to)?.dirty) return true;
    return false;
  };

  const out: string[] = [...doc.frontmatter];

  for (const line of doc.sourceLines) {
    if (!line.ref) {
      out.push(line.text);
      continue;
    }
    const indent = indentOf(line.text);
    switch (line.ref.entity) {
      case "header": {
        out.push(`${indent}flowchart ${doc.direction}`);
        break;
      }
      case "node": {
        const node = nodeById.get(line.ref.id);
        if (!node) break; // deleted
        emittedNodeIds.add(node.id);
        out.push(node.dirty ? `${indent}${nodeDecl(node)}` : line.text);
        break;
      }
      case "edge": {
        const edge = edgeById.get(line.ref.id);
        if (!edge) break; // deleted
        emittedEdgeIds.add(edge.id);
        if (edge.inlineFrom) emittedNodeIds.add(edge.from);
        if (edge.inlineTo) emittedNodeIds.add(edge.to);
        out.push(edgeNeedsRegen(edge) ? `${indent}${edgeLine(edge, nodeById)}` : line.text);
        break;
      }
      case "edgeGroup": {
        const memberIds = doc.edgeGroups[line.ref.id] ?? [];
        const members = memberIds
          .map((id) => edgeById.get(id))
          .filter((e): e is FlowEdge => Boolean(e));
        for (const edge of members) {
          emittedEdgeIds.add(edge.id);
          if (edge.inlineFrom) emittedNodeIds.add(edge.from);
          if (edge.inlineTo) emittedNodeIds.add(edge.to);
        }
        const anyChange =
          members.length !== memberIds.length || members.some(edgeNeedsRegen);
        if (!anyChange) {
          out.push(line.text);
        } else {
          // Expand the chain/fanout into simple lines — content-preserving,
          // formatting-normalizing (only happens after an actual edit).
          for (const edge of members) {
            out.push(`${indent}${edgeLine(edge, nodeById)}`);
          }
        }
        break;
      }
      case "subgraphOpen": {
        const subgraph = subgraphById.get(line.ref.id);
        if (!subgraph || !subgraphDirty(subgraph)) {
          out.push(line.text);
          break;
        }
        out.push(`${indent}subgraph ${subgraph.id}[${quoteLabel(subgraph.title)}]`);
        break;
      }
      default:
        out.push(line.text);
    }
  }

  // Appended additions: nodes created by ops (or implicit nodes renamed —
  // they need an explicit declaration now), then edges created by ops.
  const additions: string[] = [];
  for (const node of doc.nodes) {
    const declaredInline = doc.edges.some(
      (e) => (e.inlineFrom && e.from === node.id) || (e.inlineTo && e.to === node.id),
    );
    const hasLine = emittedNodeIds.has(node.id) || Boolean(node.raw);
    if ((node.added || (node.dirty && !hasLine && !declaredInline)) && !emittedViaAddition(additions, node.id)) {
      additions.push(`  ${nodeDecl(node)}`);
    }
  }
  for (const edge of doc.edges) {
    if (edge.added && !emittedEdgeIds.has(edge.id)) {
      additions.push(`  ${edgeLine(edge, nodeById)}`);
    }
  }

  // Palette classDefs for any used palette keys missing a definition line.
  const usedPalette = new Set(
    doc.nodes.map((n) => n.paletteKey).filter((k): k is string => Boolean(k)),
  );
  if (usedPalette.size > 0) {
    const existing = new Set(
      doc.sourceLines
        .map((l) => /^\s*classDef\s+(\S+)/.exec(l.text)?.[1])
        .filter(Boolean),
    );
    for (const key of usedPalette) {
      const className = `${PALETTE_PREFIX}${key}`;
      if (!existing.has(className)) {
        additions.push(`  classDef ${className} ${FLOW_PALETTE[key].classDef}`);
      }
    }
  }

  return [...out, ...additions].join("\n");
}

function emittedViaAddition(additions: string[], nodeId: string): boolean {
  return additions.some((a) => a.trimStart().startsWith(nodeId));
}

function subgraphDirty(subgraph: FlowSubgraph): boolean {
  return Boolean((subgraph as { dirty?: boolean }).dirty);
}

// ─── Ops ────────────────────────────────────────────────────────────────────

function nextNodeId(doc: FlowchartDoc): string {
  const taken = new Set(doc.nodes.map((n) => n.id));
  let i = doc.nodes.length;
  let id = `n${++i}`;
  while (taken.has(id)) id = `n${++i}`;
  return id;
}

function applyOp(doc: FlowchartDoc, op: MermaidOp): FlowchartDoc {
  const next = structuredClone(doc);
  const flowOp = op as FlowchartOp;
  const node = (id: string) => {
    const found = next.nodes.find((n) => n.id === id);
    if (!found) throw new MermaidOpError(`That step no longer exists`);
    return found;
  };
  const edge = (id: string) => {
    const found = next.edges.find((e) => e.id === id);
    if (!found) throw new MermaidOpError(`That connection no longer exists`);
    return found;
  };

  switch (flowOp.type) {
    case "addNode": {
      const id = nextNodeId(next);
      next.nodes.push({
        id,
        label: flowOp.label,
        shape: flowOp.shape ?? "rect",
        added: true,
        dirty: true,
      });
      if (flowOp.connectFrom) {
        node(flowOp.connectFrom); // validate
        next.edges.push({
          id: `e${next.edges.length + 1}_a`,
          from: flowOp.connectFrom,
          to: id,
          style: "arrow",
          added: true,
          dirty: true,
        });
      }
      return next;
    }
    case "renameNode": {
      const n = node(flowOp.id);
      n.label = flowOp.label;
      n.dirty = true;
      return next;
    }
    case "deleteNode": {
      node(flowOp.id); // validate
      next.nodes = next.nodes.filter((n) => n.id !== flowOp.id);
      next.edges = next.edges.filter((e) => e.from !== flowOp.id && e.to !== flowOp.id);
      for (const sg of next.subgraphs) {
        sg.nodeIds = sg.nodeIds.filter((id) => id !== flowOp.id);
      }
      return next;
    }
    case "setNodeShape": {
      const n = node(flowOp.id);
      n.shape = flowOp.shape;
      n.dirty = true;
      return next;
    }
    case "setNodePalette": {
      const n = node(flowOp.id);
      n.paletteKey = flowOp.paletteKey ?? undefined;
      n.dirty = true;
      return next;
    }
    case "connectNodes": {
      node(flowOp.from);
      node(flowOp.to);
      next.edges.push({
        id: `e${next.edges.length + 1}_a`,
        from: flowOp.from,
        to: flowOp.to,
        label: flowOp.label || undefined,
        style: "arrow",
        added: true,
        dirty: true,
      });
      return next;
    }
    case "deleteEdge": {
      edge(flowOp.id); // validate
      next.edges = next.edges.filter((e) => e.id !== flowOp.id);
      return next;
    }
    case "setEdgeLabel": {
      const e = edge(flowOp.id);
      e.label = flowOp.label || undefined;
      e.dirty = true;
      return next;
    }
    case "setEdgeStyle": {
      const e = edge(flowOp.id);
      e.style = flowOp.style;
      e.dirty = true;
      return next;
    }
    case "reverseEdge": {
      const e = edge(flowOp.id);
      const wasInlineFrom = e.inlineFrom;
      [e.from, e.to] = [e.to, e.from];
      [e.inlineFrom, e.inlineTo] = [e.inlineTo, wasInlineFrom];
      e.dirty = true;
      return next;
    }
    case "setDirection": {
      next.direction = flowOp.direction;
      return next;
    }
    case "renameSubgraph": {
      const sg = next.subgraphs.find((s) => s.id === flowOp.id);
      if (!sg) throw new MermaidOpError("That group no longer exists");
      sg.title = flowOp.title;
      (sg as { dirty?: boolean }).dirty = true;
      return next;
    }
    default:
      throw new MermaidOpError("Unsupported operation for flowcharts");
  }
}

export const flowchartAdapter: MermaidAdapter<FlowchartDoc> = {
  diagramType: "flowchart",
  parse,
  serialize,
  applyOp,
  vocabulary: { node: "Step", addNode: "Add step", edge: "Connection" },
};
