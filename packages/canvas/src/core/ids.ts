import type { CanvasItemId, CanvasJson, CanvasPaneId, CanvasSplitId } from "./types";

const SEP = "::";

export function canvasItemId(kind: string, key: string): CanvasItemId {
  return `${kind}${SEP}${key}` as CanvasItemId;
}

export function parseCanvasItemId(id: CanvasItemId): { kind: string; key: string } {
  const at = id.indexOf(SEP);
  return at < 0 ? { kind: id, key: "" } : { kind: id.slice(0, at), key: id.slice(at + SEP.length) };
}

export function paneIdFromSeq(seq: number): CanvasPaneId {
  return `pane-${seq}` as CanvasPaneId;
}

export function splitIdFromSeq(seq: number): CanvasSplitId {
  return `split-${seq}` as CanvasSplitId;
}

/**
 * Returns the path of the first value that is NOT plain JSON, or null when the
 * whole value is JSON. Functions, class instances, Dates, Maps, NaN and
 * Infinity all fail — they would silently vanish or change on persist.
 */
export function findNonJson(value: unknown, path = "data"): string | null {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return null;
    case "number":
      return Number.isFinite(value) ? null : path;
    case "object": {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const bad = findNonJson(value[i], `${path}[${i}]`);
          if (bad) return bad;
        }
        return null;
      }
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) return path;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue;
        const bad = findNonJson(v, `${path}.${k}`);
        if (bad) return bad;
      }
      return null;
    }
    default:
      return path;
  }
}

export function isCanvasJson(value: unknown): value is CanvasJson {
  return findNonJson(value) === null;
}
