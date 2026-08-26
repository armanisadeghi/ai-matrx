// features/context-menu-v3/__tests__/per-row-entity.test.ts
//
// THE PRECEDENCE CONTRACT for per-row identity. The DOM sniffer exists so a
// table can name its rows with three attributes instead of a hand-written
// resolver — but it must never speak over a surface that already answered.
// These tests pin that order, because getting it backwards would silently
// point Attach To / Share at the wrong record.

import { CONTEXT_MENU_ENTITY_KEY } from "../types";
import {
  resolveEffectiveEntityWithDom,
  sniffEntityFromDom,
} from "../utils/per-row-entity";

/** Build a detached row carrying `data-entity-*`, and return its inner cell. */
function rowWith(attrs: Record<string, string>, text = "Row text"): HTMLElement {
  const row = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) row.setAttribute(k, v);
  const cell = document.createElement("span");
  cell.textContent = text;
  row.appendChild(cell);
  document.body.appendChild(row);
  return cell;
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("sniffEntityFromDom", () => {
  it("reads type, id and title off the closest annotated ancestor", () => {
    const cell = rowWith({
      "data-entity-type": "seo_keyword",
      "data-entity-id": "kw-1",
      "data-entity-title": "data destruction",
    });
    expect(sniffEntityFromDom(cell)).toEqual({
      type: "seo_keyword",
      id: "kw-1",
      title: "data destruction",
    });
  });

  it("falls back to the row's own text so Attach is never labelled with a uuid", () => {
    const cell = rowWith(
      { "data-entity-type": "seo_keyword", "data-entity-id": "kw-2" },
      "hard drive shredding",
    );
    expect(sniffEntityFromDom(cell)?.title).toBe("hard drive shredding");
  });

  it("carries resourceType through when the row declares it", () => {
    const cell = rowWith({
      "data-entity-type": "note",
      "data-entity-id": "n-1",
      "data-entity-resource": "note",
    });
    expect(sniffEntityFromDom(cell)?.resourceType).toBe("note");
  });

  it("returns null when the row is not annotated", () => {
    const bare = document.createElement("div");
    document.body.appendChild(bare);
    expect(sniffEntityFromDom(bare)).toBeNull();
  });

  it("returns null and SCREAMS on a malformed token rather than attaching to nothing", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const cell = rowWith({
      "data-entity-type": "Not A Token",
      "data-entity-id": "x-1",
    });
    expect(sniffEntityFromDom(cell)).toBeNull();
    expect(err).toHaveBeenCalled();
  });

  it("ignores a half-annotated row (type without id)", () => {
    const cell = rowWith({ "data-entity-type": "seo_keyword" });
    expect(sniffEntityFromDom(cell)).toBeNull();
  });
});

describe("resolveEffectiveEntityWithDom — precedence", () => {
  const propEntity = { type: "note" as const, id: "pane", title: "The pane" };
  const rowEntity = { type: "seo_keyword" as const, id: "kw-9", title: "row" };

  it("a surface's explicit per-row entity beats the DOM", () => {
    const cell = rowWith({
      "data-entity-type": "seo_keyword",
      "data-entity-id": "from-dom",
    });
    const out = resolveEffectiveEntityWithDom(
      propEntity,
      { [CONTEXT_MENU_ENTITY_KEY]: rowEntity },
      cell,
    );
    expect(out).toEqual(rowEntity);
  });

  it("a surface's explicit null means NO entity — the DOM never overrides it", () => {
    const cell = rowWith({
      "data-entity-type": "seo_keyword",
      "data-entity-id": "from-dom",
    });
    const out = resolveEffectiveEntityWithDom(
      propEntity,
      { [CONTEXT_MENU_ENTITY_KEY]: null },
      cell,
    );
    expect(out).toBeUndefined();
  });

  it("the DOM fills the silence when the surface said nothing about the entity", () => {
    const cell = rowWith({
      "data-entity-type": "seo_keyword",
      "data-entity-id": "kw-3",
      "data-entity-title": "shredding",
    });
    const out = resolveEffectiveEntityWithDom(propEntity, { content: "x" }, cell);
    expect(out).toEqual({ type: "seo_keyword", id: "kw-3", title: "shredding" });
  });

  it("the menu-level prop is the floor when neither speaks", () => {
    const bare = document.createElement("div");
    document.body.appendChild(bare);
    expect(resolveEffectiveEntityWithDom(propEntity, null, bare)).toEqual(
      propEntity,
    );
  });
});
