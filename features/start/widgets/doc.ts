// features/start/widgets/doc.ts — THE START PAGE'S VERBS, pure functions over `StartDoc`.
//
// The person's Edit mode and the Start page agent (Slice 2) call these same functions; each committed
// batch is one saved version. Every verb returns a NEW doc and never throws: a verb aimed at a widget
// that is not there returns the doc unchanged. Parse keeps widgets of unknown types (a type a later
// build removed or a newer build added) so nothing is ever dropped on a round trip.
import {
  START_WIDGET_SIZES,
  type StartDoc,
  type StartWidget,
  type StartWidgetConfig,
  type StartWidgetSize,
} from "./types";

export const EMPTY_START_DOC: StartDoc = { schema: 1, widgets: [] };

/** A short random id, unique within one doc. */
export function newStartWidgetId(taken: readonly StartWidget[] = []): string {
  for (;;) {
    const id = `w_${Math.random().toString(36).slice(2, 10)}`;
    if (!taken.some((w) => w.id === id)) return id;
  }
}

const isSize = (v: unknown): v is StartWidgetSize =>
  typeof v === "string" && (START_WIDGET_SIZES as readonly string[]).includes(v);

function parseConfig(v: unknown): StartWidgetConfig {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: StartWidgetConfig = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
    else if (typeof val === "number" || typeof val === "boolean") out[k] = String(val);
  }
  return out;
}

export type StartDocParse = { ok: true; doc: StartDoc } | { ok: false; error: string };

/**
 * Read a stored doc (string or object). A widget needs a string `type`; everything else is repaired
 * (missing id → a fresh one, a bad size → "m", a bad config → {}). Unknown types are KEPT.
 */
export function parseStartDoc(raw: unknown): StartDocParse {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "The saved layout is not readable." };
    }
  }
  if (typeof value !== "object" || value === null) return { ok: false, error: "The saved layout is empty." };
  const o = value as { schema?: unknown; widgets?: unknown };
  if (o.schema !== 1) return { ok: false, error: `The saved layout is schema ${String(o.schema)}, not 1.` };
  if (!Array.isArray(o.widgets)) return { ok: false, error: "The saved layout has no widget list." };
  const widgets: StartWidget[] = [];
  for (const w of o.widgets) {
    if (typeof w !== "object" || w === null) continue;
    const r = w as Record<string, unknown>;
    if (typeof r.type !== "string" || !r.type) continue;
    const id = typeof r.id === "string" && r.id && !widgets.some((x) => x.id === r.id) ? r.id : newStartWidgetId(widgets);
    widgets.push({ id, type: r.type, size: isSize(r.size) ? r.size : "m", config: parseConfig(r.config) });
  }
  return { ok: true, doc: { schema: 1, widgets } };
}

export function serializeStartDoc(doc: StartDoc): string {
  return JSON.stringify(doc);
}

/** Add a widget at `index` (default: the end). */
export function addWidget(
  doc: StartDoc,
  widget: { type: string; size: StartWidgetSize; config?: StartWidgetConfig; id?: string },
  index?: number,
): StartDoc {
  const id = widget.id && !doc.widgets.some((w) => w.id === widget.id) ? widget.id : newStartWidgetId(doc.widgets);
  const next: StartWidget = { id, type: widget.type, size: widget.size, config: { ...(widget.config ?? {}) } };
  const widgets = [...doc.widgets];
  const at = index === undefined ? widgets.length : Math.max(0, Math.min(index, widgets.length));
  widgets.splice(at, 0, next);
  return { ...doc, widgets };
}

export function removeWidget(doc: StartDoc, id: string): StartDoc {
  if (!doc.widgets.some((w) => w.id === id)) return doc;
  return { ...doc, widgets: doc.widgets.filter((w) => w.id !== id) };
}

/** Move a widget to `toIndex` (clamped). */
export function moveWidget(doc: StartDoc, id: string, toIndex: number): StartDoc {
  const from = doc.widgets.findIndex((w) => w.id === id);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(toIndex, doc.widgets.length - 1));
  if (to === from) return doc;
  const widgets = [...doc.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(to, 0, moved!);
  return { ...doc, widgets };
}

/** Move a widget one place earlier (-1) or later (+1). */
export function nudgeWidget(doc: StartDoc, id: string, by: -1 | 1): StartDoc {
  const from = doc.widgets.findIndex((w) => w.id === id);
  return from < 0 ? doc : moveWidget(doc, id, from + by);
}

export function resizeWidget(doc: StartDoc, id: string, size: StartWidgetSize): StartDoc {
  if (!doc.widgets.some((w) => w.id === id && w.size !== size)) return doc;
  return { ...doc, widgets: doc.widgets.map((w) => (w.id === id ? { ...w, size } : w)) };
}

/** Merge config keys into a widget's config (a value of "" clears that key). */
export function configureWidget(doc: StartDoc, id: string, patch: StartWidgetConfig): StartDoc {
  if (!doc.widgets.some((w) => w.id === id)) return doc;
  return {
    ...doc,
    widgets: doc.widgets.map((w) => {
      if (w.id !== id) return w;
      const config = { ...w.config };
      for (const [k, v] of Object.entries(patch)) {
        if (v === "") delete config[k];
        else config[k] = v;
      }
      return { ...w, config };
    }),
  };
}

export function sameStartDoc(a: StartDoc, b: StartDoc): boolean {
  return serializeStartDoc(a) === serializeStartDoc(b);
}
