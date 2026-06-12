/**
 * DOM ↔ model mapping for rendered mermaid SVGs (flowchart family).
 *
 * mermaid v11 renders flowchart nodes as `g.node` with id
 * `flowchart-<nodeId>-<counter>` and edges as paths with id `L_<from>_<to>_<n>`
 * (class `flowchart-link`). All DOM knowledge is isolated HERE so a mermaid
 * minor-version drift breaks exactly one file — and the runtime self-check in
 * useSvgInteraction degrades visual affordances gracefully instead of leaving
 * broken-feeling clicks.
 */

export interface SvgHit {
  kind: "node" | "edge";
  id: string; // model id: node id, or edge "from→to" pair key
  element: SVGGraphicsElement;
}

const NODE_ID_RE = /^flowchart-(.+)-\d+$/;
const EDGE_ID_RE = /^L[-_]([^_]+)[-_](.+?)[-_]\d+$/;

export function extractNodeId(domId: string): string | null {
  return NODE_ID_RE.exec(domId)?.[1] ?? null;
}

export function extractEdgePair(domId: string): { from: string; to: string } | null {
  const m = EDGE_ID_RE.exec(domId);
  return m ? { from: m[1], to: m[2] } : null;
}

/** Stamp data-mmid attributes onto mapped elements; returns mapped node count. */
export function stampSvg(svg: SVGSVGElement): number {
  let mapped = 0;
  svg.querySelectorAll<SVGGraphicsElement>("g.node[id]").forEach((g) => {
    const nodeId = extractNodeId(g.id);
    if (nodeId) {
      g.setAttribute("data-mmid", nodeId);
      g.setAttribute("data-mmkind", "node");
      (g.style as CSSStyleDeclaration).cursor = "pointer";
      mapped++;
    }
  });
  svg.querySelectorAll<SVGGraphicsElement>("path.flowchart-link[id], path[id^='L_'], path[id^='L-']").forEach((p) => {
    const pair = extractEdgePair(p.id);
    if (pair) {
      p.setAttribute("data-mmid", `${pair.from}→${pair.to}`);
      p.setAttribute("data-mmkind", "edge");
      (p.style as CSSStyleDeclaration).cursor = "pointer";
    }
  });
  return mapped;
}

export function findHit(target: EventTarget | null): SvgHit | null {
  let el = target instanceof Element ? target : null;
  while (el && el.tagName.toLowerCase() !== "svg") {
    const id = el.getAttribute("data-mmid");
    const kind = el.getAttribute("data-mmkind");
    if (id && (kind === "node" || kind === "edge")) {
      return { kind, id, element: el as SVGGraphicsElement };
    }
    el = el.parentElement;
  }
  return null;
}

/** Selection/hover styling injected once per SVG (scoped via data attrs). */
export function injectSelectionStyles(svg: SVGSVGElement): void {
  if (svg.querySelector("style[data-mmstyles]")) return;
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("data-mmstyles", "true");
  style.textContent = `
    [data-mmkind="node"]:hover { filter: brightness(1.06); }
    [data-mmkind="node"][data-mmselected="true"] rect,
    [data-mmkind="node"][data-mmselected="true"] circle,
    [data-mmkind="node"][data-mmselected="true"] polygon,
    [data-mmkind="node"][data-mmselected="true"] path:first-of-type {
      stroke: var(--primary) !important;
      stroke-width: 2.5px !important;
    }
    [data-mmkind="edge"][data-mmselected="true"] {
      stroke: var(--primary) !important;
      stroke-width: 3px !important;
    }
  `;
  svg.appendChild(style);
}

export function applySelection(svg: SVGSVGElement, selectedId: string | null): void {
  svg.querySelectorAll("[data-mmselected]").forEach((el) => el.removeAttribute("data-mmselected"));
  if (!selectedId) return;
  svg
    .querySelectorAll(`[data-mmid="${CSS.escape(selectedId)}"]`)
    .forEach((el) => el.setAttribute("data-mmselected", "true"));
}
