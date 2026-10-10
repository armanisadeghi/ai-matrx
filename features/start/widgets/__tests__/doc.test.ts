import {
  addWidget,
  configureWidget,
  EMPTY_START_DOC,
  moveWidget,
  nudgeWidget,
  parseStartDoc,
  removeWidget,
  resizeWidget,
  serializeStartDoc,
} from "../doc";
import { defaultStartDoc } from "../defaultDoc";
import { summarizeStartEdit } from "../editNote";
import type { StartDoc } from "../types";

const doc: StartDoc = {
  schema: 1,
  widgets: [
    { id: "a", type: "metric", size: "s", config: { metric: "agents" } },
    { id: "b", type: "tasks", size: "m", config: {} },
    { id: "c", type: "recent", size: "l", config: { kind: "note" } },
  ],
};

describe("Start doc verbs", () => {
  it("add appends a new widget with a fresh id, or inserts at an index", () => {
    const next = addWidget(doc, { type: "agenda", size: "m" });
    expect(next.widgets).toHaveLength(4);
    expect(next.widgets[3]!.type).toBe("agenda");
    expect(doc.widgets.map((w) => w.id)).not.toContain(next.widgets[3]!.id);
    expect(addWidget(doc, { type: "agenda", size: "m", id: "z" }, 0).widgets[0]!.id).toBe("z");
    expect(addWidget(doc, { type: "agenda", size: "m", id: "a" }).widgets[3]!.id).not.toBe("a");
    expect(doc.widgets).toHaveLength(3);
  });

  it("remove drops one widget; an unknown id is a no-op", () => {
    expect(removeWidget(doc, "b").widgets.map((w) => w.id)).toEqual(["a", "c"]);
    expect(removeWidget(doc, "nope")).toBe(doc);
  });

  it("move and nudge reorder, clamped at the ends", () => {
    expect(moveWidget(doc, "a", 2).widgets.map((w) => w.id)).toEqual(["b", "c", "a"]);
    expect(moveWidget(doc, "c", -5).widgets.map((w) => w.id)).toEqual(["c", "a", "b"]);
    expect(nudgeWidget(doc, "b", -1).widgets.map((w) => w.id)).toEqual(["b", "a", "c"]);
    expect(nudgeWidget(doc, "a", -1)).toBe(doc);
  });

  it("resize and configure change one widget; an empty value clears a key", () => {
    expect(resizeWidget(doc, "a", "m").widgets[0]!.size).toBe("m");
    expect(resizeWidget(doc, "a", "s")).toBe(doc);
    const configured = configureWidget(doc, "c", { kind: "file", extra: "1" });
    expect(configured.widgets[2]!.config).toEqual({ kind: "file", extra: "1" });
    expect(configureWidget(configured, "c", { extra: "" }).widgets[2]!.config).toEqual({ kind: "file" });
  });
});

describe("parseStartDoc", () => {
  it("round-trips a doc", () => {
    const parsed = parseStartDoc(serializeStartDoc(doc));
    expect(parsed).toEqual({ ok: true, doc });
  });

  it("keeps a widget of an unknown type (never dropped)", () => {
    const raw = JSON.stringify({ schema: 1, widgets: [{ id: "x", type: "weather_from_the_future", size: "l", config: { city: "Irvine" } }] });
    const parsed = parseStartDoc(raw);
    expect(parsed.ok && parsed.doc.widgets).toEqual([{ id: "x", type: "weather_from_the_future", size: "l", config: { city: "Irvine" } }]);
  });

  it("repairs bad sizes, missing or duplicate ids and bad configs; skips typeless entries", () => {
    const parsed = parseStartDoc({
      schema: 1,
      widgets: [{ id: "a", type: "tasks", size: "xl", config: [1] }, { id: "a", type: "agenda" }, { size: "s" }, null],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.widgets).toHaveLength(2);
    expect(parsed.doc.widgets[0]).toEqual({ id: "a", type: "tasks", size: "m", config: {} });
    expect(parsed.doc.widgets[1]!.id).not.toBe("a");
  });

  it("refuses unreadable text and other schemas by name", () => {
    expect(parseStartDoc("{nope").ok).toBe(false);
    expect(parseStartDoc({ schema: 2, widgets: [] })).toEqual({ ok: false, error: "The saved layout is schema 2, not 1." });
    expect(parseStartDoc(null).ok).toBe(false);
  });
});

describe("default layout and edit note", () => {
  it("seeds the normal app first and the old start page last", () => {
    expect(defaultStartDoc(null).widgets.map((w) => w.type)).toEqual([
      "kpis", "tasks", "agenda", "recent", "favorites", "agents",
    ]);
    const withPage = defaultStartDoc("p1").widgets;
    expect(withPage[withPage.length - 1]).toMatchObject({ type: "page", size: "l", config: { pageId: "p1" } });
    expect(EMPTY_START_DOC.widgets).toEqual([]);
  });

  it("names what changed", () => {
    const next = removeWidget(addWidget(doc, { type: "agenda", size: "m" }), "b");
    expect(summarizeStartEdit(doc, next)).toBe("Added Today's meetings · Removed Open and overdue tasks");
    expect(summarizeStartEdit(doc, nudgeWidget(doc, "c", -1))).toBe("Reordered");
  });
});
