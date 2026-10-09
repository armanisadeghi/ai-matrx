/**
 * Board — shapes (rectangles, ovals, lines, arrows, pen strokes) as
 * first-class objects: their stored form, style, migration-safe parsing, and
 * the pure geometry every surface uses (hit testing, bounds, resize, binding).
 *
 * Champions: tldraw / FigJam / Figma.
 *  - A click anywhere inside a rectangle or oval finds it, filled or not; a
 *    click within a few SCREEN px of a thin line, arrow or pen stroke finds it.
 *  - A stroke or a filled body beats a hollow interior: the pen line inside a
 *    big empty rectangle is the one you meant (tldraw's hollow-shape rule), and
 *    among hollow interiors the smallest wins.
 *  - A line or arrow end dropped on a tile or a box shape BINDS to it and
 *    follows it: the end is drawn where the line from the other end meets the
 *    target's outline (tldraw arrows).
 *  - Strokes are in WORLD px (they scale with zoom, like tldraw / FigJam).
 *
 * Style is stored PARTIAL — only what the person changed — so an old shape
 * (id, kind, points) reads as the defaults and a new default never rewrites a
 * saved board.
 */

import type { Rect } from "./camera";

export type ShapeKind = "rect" | "rounded" | "oval" | "triangle" | "diamond" | "star" | "arrow" | "line" | "pen" | "sticky" | "text";
export const SHAPE_KINDS: readonly ShapeKind[] = ["rect", "rounded", "oval", "triangle", "diamond", "star", "arrow", "line", "pen", "sticky", "text"];

export interface Point {
  x: number;
  y: number;
}

/** A small semantic palette; each key has a light and a dark value (`board-accents.css`). */
export const SHAPE_COLORS = ["ink", "slate", "blue", "violet", "rose", "orange", "amber", "emerald", "teal"] as const;
export type ShapeColor = (typeof SHAPE_COLORS)[number];
export type ShapeFill = "none" | ShapeColor;

/** Stroke weights in world px (tldraw's S / M / L / XL). */
export const STROKE_WIDTHS = { s: 2, m: 4, l: 8, xl: 14 } as const;
export type StrokeSize = keyof typeof STROKE_WIDTHS;
export const DASHES = ["solid", "dashed", "dotted"] as const;
export type ShapeDash = (typeof DASHES)[number];
/** Text sizes in world px. */
export const TEXT_SIZES = { s: 16, m: 24, l: 36, xl: 56 } as const;
export type TextSize = keyof typeof TEXT_SIZES;
export const TEXT_ALIGNS = ["start", "center", "end"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const TEXT_WEIGHTS = ["normal", "bold"] as const;
export type TextWeight = (typeof TEXT_WEIGHTS)[number];
/** Sticky note colours (FigJam / Miro); light + dark from `board-accents.css` (`--board-sticky-*`). */
export const STICKY_COLORS = ["yellow", "orange", "pink", "violet", "blue", "green"] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];
/** A new sticky's side in world px (FigJam's default square). */
export const STICKY_SIZE = 220;

export interface ShapeStyle {
  stroke: ShapeColor;
  fill: ShapeFill;
  size: StrokeSize;
  /** 0.1 … 1. */
  opacity: number;
  dash: ShapeDash;
  textSize: TextSize;
  textAlign: TextAlign;
  /** Plain canvas text's weight. */
  textWeight: TextWeight;
  /** A sticky note's colour. */
  sticky: StickyColor;
}

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  stroke: "ink",
  fill: "none",
  size: "s",
  opacity: 1,
  dash: "solid",
  textSize: "m",
  textAlign: "center",
  textWeight: "normal",
  sticky: "yellow",
};

/** What a line or arrow end is attached to: a tile id or a shape id. */
export interface ShapeBinding {
  start?: string;
  end?: string;
}

export interface BoardShape {
  id: string;
  kind: ShapeKind;
  /** World-space points: two for rect/oval/arrow/line (corners or ends), many for pen. */
  points: Point[];
  /** Only what differs from `DEFAULT_SHAPE_STYLE`. */
  style?: Partial<ShapeStyle>;
  /** Centred text inside a rectangle or oval. */
  text?: string;
  /** Line / arrow ends attached to objects (they follow them). */
  bind?: ShapeBinding;
  /**
   * A sticky's Note (its text is that Note's words; `text` here is the board's
   * copy for painting and agents, refreshed from the Note when the board opens).
   * Absent until the first typed character creates the Note.
   */
  note?: string;
  /** Plain text: true once resized by hand (fixed width, wraps); absent = grows with its words. */
  wrap?: boolean;
}

/** Something a connector end can attach to: its rect and outline. */
export interface BindTarget {
  rect: Rect;
  outline: "rect" | "oval";
}
export type TargetLookup = (id: string) => BindTarget | undefined;

export const isConnector = (kind: ShapeKind): boolean => kind === "line" || kind === "arrow";
/** The closed shapes (box, rounded box, oval, triangle, diamond, star): select, resize, style, hold text, bindable. */
export const isBoxKind = (kind: ShapeKind): boolean =>
  kind === "rect" || kind === "rounded" || kind === "oval" || kind === "triangle" || kind === "diamond" || kind === "star";
/** The kinds drawn as a polygon inside their box. */
export const isPolygonKind = (kind: ShapeKind): boolean => kind === "triangle" || kind === "diamond" || kind === "star";

/** A polygon shape's corners inside its box (a star is five points out of ten corners). */
export function shapePolygon(kind: ShapeKind, box: Rect): Point[] | null {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (kind === "triangle") return [{ x: cx, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }];
  if (kind === "diamond") return [{ x: cx, y: box.y }, { x: box.x + box.w, y: cy }, { x: cx, y: box.y + box.h }, { x: box.x, y: cy }];
  if (kind === "star") {
    return Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 === 0 ? 1 : 0.42;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      return { x: cx + (box.w / 2) * r * Math.cos(a), y: cy + (box.h / 2) * r * Math.sin(a) };
    });
  }
  return null;
}

function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** Sticky notes and plain canvas text: words ON the canvas, no chrome (FigJam / tldraw). */
export const isCanvasText = (kind: ShapeKind): boolean => kind === "sticky" || kind === "text";
/** A drawing (stroke / fill / line style apply), as opposed to canvas text. */
export const isDrawing = (kind: ShapeKind): boolean => !isCanvasText(kind);
/** Objects stored as a box (two corners): resize takes the rect; a line or arrow end can bind to them. */
export const isBoxed = (kind: ShapeKind): boolean => isBoxKind(kind) || isCanvasText(kind);
/** Rectangles, ovals, stickies and plain text hold text. */
export const textCapable = isBoxed;

export function styleOf(shape: Pick<BoardShape, "style">): ShapeStyle {
  return shape.style ? { ...DEFAULT_SHAPE_STYLE, ...shape.style } : DEFAULT_SHAPE_STYLE;
}

export function strokeWidthOf(shape: Pick<BoardShape, "style">): number {
  return STROKE_WIDTHS[styleOf(shape).size];
}

/** The CSS colour for a palette key; `alpha` for a fill tint. Light + dark come from the theme. */
export function shapeColorCss(color: ShapeColor, alpha = 1): string {
  const channels = color === "ink" ? "var(--foreground)" : `var(--board-accent-${color})`;
  return alpha === 1 ? `hsl(${channels})` : `hsl(${channels} / ${alpha})`;
}

/** The fill tint's alpha (tldraw's "semi" fill: the colour reads, text on it stays readable). */
export const FILL_ALPHA = 0.22;

// ── parsing (the read boundary) ──────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPoint = (v: unknown): v is Point => isObj(v) && Number.isFinite(v.x) && Number.isFinite(v.y);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** A style read from storage: every valid field kept, every invalid one dropped and named. */
export function parseShapeStyle(raw: unknown, problems: string[], label: string): Partial<ShapeStyle> | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) {
    problems.push(`${label}: style was not an object; using the defaults`);
    return undefined;
  }
  const out: Partial<ShapeStyle> = {};
  const bad: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case "stroke":
        if (oneOf(SHAPE_COLORS, value)) out.stroke = value;
        else bad.push(key);
        break;
      case "fill":
        if (value === "none" || oneOf(SHAPE_COLORS, value)) out.fill = value;
        else bad.push(key);
        break;
      case "size":
        if (oneOf(Object.keys(STROKE_WIDTHS) as StrokeSize[], value)) out.size = value;
        else bad.push(key);
        break;
      case "dash":
        if (oneOf(DASHES, value)) out.dash = value;
        else bad.push(key);
        break;
      case "opacity":
        if (typeof value === "number" && value >= 0.1 && value <= 1) out.opacity = value;
        else bad.push(key);
        break;
      case "textSize":
        if (oneOf(Object.keys(TEXT_SIZES) as TextSize[], value)) out.textSize = value;
        else bad.push(key);
        break;
      case "textAlign":
        if (oneOf(TEXT_ALIGNS, value)) out.textAlign = value;
        else bad.push(key);
        break;
      case "textWeight":
        if (oneOf(TEXT_WEIGHTS, value)) out.textWeight = value;
        else bad.push(key);
        break;
      case "sticky":
        if (oneOf(STICKY_COLORS, value)) out.sticky = value;
        else bad.push(key);
        break;
      default:
        bad.push(key);
    }
  }
  if (bad.length) problems.push(`${label}: dropped unknown style ${bad.join(", ")}`);
  return Object.keys(out).length ? out : undefined;
}

/** One stored shape → a shape, or null with the reason. Old rows (id, kind, points) parse unchanged. */
export function parseShape(raw: unknown, label = "shape"): { shape: BoardShape | null; problems: string[] } {
  const problems: string[] = [];
  if (!isObj(raw)) return { shape: null, problems: [`${label} is not an object`] };
  const kind = SHAPE_KINDS.find((k) => k === raw.kind);
  const points = Array.isArray(raw.points) ? raw.points.filter(isPoint).map((p) => ({ x: p.x, y: p.y })) : [];
  if (typeof raw.id !== "string" || !kind || points.length < 2) {
    return { shape: null, problems: [`${label} is missing id, kind or points`] };
  }
  const shape: BoardShape = { id: raw.id, kind, points };
  const style = parseShapeStyle(raw.style, problems, label);
  if (style) shape.style = style;
  if (typeof raw.text === "string" && raw.text) shape.text = raw.text;
  else if (raw.text !== undefined && typeof raw.text !== "string") problems.push(`${label}: text was not a string`);
  if (isObj(raw.bind)) {
    const bind: ShapeBinding = {};
    if (typeof raw.bind.start === "string") bind.start = raw.bind.start;
    if (typeof raw.bind.end === "string") bind.end = raw.bind.end;
    if (bind.start || bind.end) shape.bind = bind;
  }
  if (typeof raw.note === "string" && raw.note) shape.note = raw.note;
  if (raw.wrap === true) shape.wrap = true;
  return { shape, problems };
}

/** The stored form: only fields that carry something. */
export function serializeShape(shape: BoardShape): Record<string, unknown> {
  return {
    id: shape.id,
    kind: shape.kind,
    points: shape.points,
    ...(shape.style && Object.keys(shape.style).length ? { style: shape.style } : {}),
    ...(shape.text ? { text: shape.text } : {}),
    ...(shape.bind && (shape.bind.start || shape.bind.end) ? { bind: shape.bind } : {}),
    ...(shape.note ? { note: shape.note } : {}),
    ...(shape.wrap ? { wrap: true } : {}),
  };
}

// ── geometry ─────────────────────────────────────────────────────────────────

export function boundsOfPoints(points: readonly Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** World px between a bound end and its target's outline. */
const BIND_GAP = 8;

/** Where the ray from the target's centre toward `toward` leaves its outline (+ a small gap). */
function exitPoint(target: BindTarget, toward: Point): Point {
  const c = centre(target.rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return c;
  const hw = target.rect.w / 2;
  const hh = target.rect.h / 2;
  let t: number;
  if (target.outline === "oval") {
    t = hw > 0 && hh > 0 ? 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2) : 0;
  } else {
    const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
    const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
    t = Math.min(tx, ty);
  }
  const gap = Math.min(BIND_GAP / len, 1 - t > 0 ? 1 - t : 0);
  return { x: c.x + dx * (t + gap), y: c.y + dy * (t + gap) };
}

/**
 * A line's / arrow's two drawn ends with its bindings resolved: a bound end
 * sits where the line toward the other end meets the target's outline. A
 * binding whose target is gone (or that covers the other end) falls back to
 * the stored point.
 */
export function connectorEnds(shape: BoardShape, lookup: TargetLookup): [Point, Point] {
  const a = shape.points[0];
  const b = shape.points[shape.points.length - 1];
  const ta = shape.bind?.start ? lookup(shape.bind.start) : undefined;
  const tb = shape.bind?.end ? lookup(shape.bind.end) : undefined;
  if (!ta && !tb) return [a, b];
  const aimA = ta ? centre(ta.rect) : a;
  const aimB = tb ? centre(tb.rect) : b;
  return [ta ? exitPoint(ta, aimB) : a, tb ? exitPoint(tb, aimA) : b];
}

/** The points as drawn (bindings resolved). */
export function drawnPoints(shape: BoardShape, lookup: TargetLookup): Point[] {
  if (!isConnector(shape.kind) || !shape.bind) return shape.points;
  return connectorEnds(shape, lookup);
}

/** The shape's box (the stroke's own width left out, like a tile's rect). */
export function shapeBounds(shape: BoardShape, lookup: TargetLookup = () => undefined): Rect {
  return boundsOfPoints(drawnPoints(shape, lookup));
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export type ShapeHit = "stroke" | "fill" | "interior";

/**
 * What a press at world point `p` touches on `shape`: its stroke (within
 * `tolerance` world px plus half the stroke), its filled body, or the hollow
 * interior of an unfilled rectangle / oval; null for nothing.
 */
export function hitShape(shape: BoardShape, p: Point, tolerance: number, lookup: TargetLookup): ShapeHit | null {
  const reach = tolerance + strokeWidthOf(shape) / 2;
  const pts = drawnPoints(shape, lookup);
  const box = boundsOfPoints(pts);
  if (p.x < box.x - reach || p.x > box.x + box.w + reach || p.y < box.y - reach || p.y > box.y + box.h + reach) return null;
  const filled = styleOf(shape).fill !== "none";
  switch (shape.kind) {
    case "line":
    case "arrow":
    case "pen": {
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= reach) return "stroke";
      if (pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= reach) return "stroke";
      return null;
    }
    case "sticky":
    case "text": {
      // Words on the canvas: anywhere in the box is the object (a sticky is a solid card).
      const inside = p.x >= box.x - tolerance && p.x <= box.x + box.w + tolerance && p.y >= box.y - tolerance && p.y <= box.y + box.h + tolerance;
      return inside ? "fill" : null;
    }
    case "triangle":
    case "diamond":
    case "star": {
      const poly = shapePolygon(shape.kind, box);
      if (!poly) return null;
      for (let i = 0; i < poly.length; i++) if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]) <= reach) return "stroke";
      return pointInPolygon(p, poly) ? (filled ? "fill" : "interior") : null;
    }
    case "rect":
    case "rounded": {
      const inside = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
      const edge = inside
        ? Math.min(p.x - box.x, box.x + box.w - p.x, p.y - box.y, box.y + box.h - p.y)
        : Math.hypot(Math.max(box.x - p.x, 0, p.x - box.x - box.w), Math.max(box.y - p.y, 0, p.y - box.y - box.h));
      if (edge <= reach) return "stroke";
      return inside ? (filled ? "fill" : "interior") : null;
    }
    case "oval": {
      const rx = box.w / 2;
      const ry = box.h / 2;
      if (rx <= 0 || ry <= 0) return null;
      const c = centre(box);
      const r = Math.hypot((p.x - c.x) / rx, (p.y - c.y) / ry);
      if (Math.abs(r - 1) * Math.min(rx, ry) <= reach) return "stroke";
      return r < 1 ? (filled ? "fill" : "interior") : null;
    }
  }
}

/**
 * The shape a press at `p` selects, topmost first. A stroke or fill anywhere
 * in the stack beats a hollow interior; hollow interiors count only when the
 * press is on empty board (`background`) — over a tile, the tile wins — and
 * the smallest one wins.
 */
export function topShapeAt(
  shapes: readonly BoardShape[],
  p: Point,
  tolerance: number,
  lookup: TargetLookup,
  opts: { background: boolean; except?: ReadonlySet<string> },
): string | null {
  let interior: { id: string; area: number } | null = null;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (opts.except?.has(s.id)) continue;
    const hit = hitShape(s, p, tolerance, lookup);
    if (hit === "stroke" || hit === "fill") return s.id;
    if (hit === "interior" && opts.background) {
      const b = shapeBounds(s, lookup);
      const area = b.w * b.h;
      if (!interior || area < interior.area) interior = { id: s.id, area };
    }
  }
  return interior?.id ?? null;
}

/** Every point moved by (dx, dy). */
export function translateShape(shape: BoardShape, dx: number, dy: number): BoardShape {
  return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/**
 * The shape fitted to `to`: every point keeps its relative place in the box —
 * a rectangle or oval takes the rect, a line keeps its direction, a pen
 * stroke scales with the box. A flat side (a horizontal line's zero height)
 * moves without scaling.
 */
export function resizeShapeTo(shape: BoardShape, to: Rect): BoardShape {
  const from = boundsOfPoints(shape.points);
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  const points = shape.points.map((p) => ({
    x: to.x + (from.w > 0 ? (p.x - from.x) * sx : to.w / 2),
    y: to.y + (from.h > 0 ? (p.y - from.y) * sy : to.h / 2),
  }));
  if (isBoxed(shape.kind)) {
    const next: BoardShape = { ...shape, points: [{ x: to.x, y: to.y }, { x: to.x + to.w, y: to.y + to.h }] };
    // Plain text resized by hand keeps that width and wraps (tldraw); its height follows its words.
    if (shape.kind === "text" && Math.abs(to.w - from.w) > 0.5) next.wrap = true;
    return next;
  }
  return { ...shape, points };
}

/** The shape with the bound ends named in `ids` fixed where they are drawn now, and unbound. */
export function bakeBindings(shape: BoardShape, lookup: TargetLookup, ids?: ReadonlySet<string>): BoardShape {
  if (!shape.bind || !isConnector(shape.kind)) return shape;
  const hitsStart = !!shape.bind.start && (!ids || ids.has(shape.bind.start));
  const hitsEnd = !!shape.bind.end && (!ids || ids.has(shape.bind.end));
  if (!hitsStart && !hitsEnd) return shape;
  const [a, b] = connectorEnds(shape, lookup);
  const points = [...shape.points];
  if (hitsStart) points[0] = a;
  if (hitsEnd) points[points.length - 1] = b;
  const bind: ShapeBinding = {};
  if (shape.bind.start && !hitsStart) bind.start = shape.bind.start;
  if (shape.bind.end && !hitsEnd) bind.end = shape.bind.end;
  const next: BoardShape = { ...shape, points };
  if (bind.start || bind.end) next.bind = bind;
  else delete next.bind;
  return next;
}

/** Merge a style patch into a shape, keeping only non-default values stored. */
export function withStyle(shape: BoardShape, patch: Partial<ShapeStyle>): BoardShape {
  const merged: Partial<ShapeStyle> = { ...shape.style, ...patch };
  const style: Partial<ShapeStyle> = {};
  for (const key of Object.keys(merged) as (keyof ShapeStyle)[]) {
    if (merged[key] !== DEFAULT_SHAPE_STYLE[key]) (style as Record<string, unknown>)[key] = merged[key];
  }
  const next: BoardShape = { ...shape };
  if (Object.keys(style).length) next.style = style;
  else delete next.style;
  return next;
}

/** The SVG dash array for a style at a stroke width. */
export function dashArray(dash: ShapeDash, width: number): string | undefined {
  if (dash === "dashed") return `${width * 4} ${width * 3}`;
  if (dash === "dotted") return `0 ${width * 2.5}`;
  return undefined;
}
