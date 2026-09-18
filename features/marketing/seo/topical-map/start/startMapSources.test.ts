// features/marketing/seo/topical-map/start/startMapSources.test.ts
//
// FORCING FUNCTIONS for the start-a-map tiles.
//
// 1. THE TILES ARE THE WIRE'S KINDS, EXACTLY — every kind in
//    `MAP_AUTHOR_SOURCE_KINDS` has one tile and there is no tile for a kind the
//    server does not take. A tile without a wire kind would launch a 422; a wire
//    kind without a tile would be a source the person can never choose.
// 2. THE TILE'S CONTROL AGREES WITH WHAT THE BODY REQUIRES — a tile that
//    collects nothing (`none`, `site`) must build a body with nothing typed,
//    and a tile that collects text/research must be REFUSED by
//    `authorTopicalMapBody` when that thing is missing (locally, before a paid
//    call). If someone changes a tile's control without changing the wire, or
//    the wire's requirements without the tile, this goes red.
// 3. NO LABEL LIVES IN THE WIRE — the wire const stays label-free, so the
//    screen's words have exactly one home.

import { authorTopicalMapBody, MAP_AUTHOR_SOURCE_KINDS } from "../map-author";
import { START_MAP_SOURCES, START_MAP_SOURCE_ORDER, startMapSource } from "./startMapSources";

const BRAND = "00000000-0000-4000-8000-000000000001";

describe("START_MAP_SOURCES", () => {
  it("declares exactly one tile per wire kind, in the wire's order", () => {
    expect(START_MAP_SOURCES.map((s) => s.kind)).toEqual([...MAP_AUTHOR_SOURCE_KINDS]);
    expect(START_MAP_SOURCE_ORDER).toBe(MAP_AUTHOR_SOURCE_KINDS);
    for (const kind of MAP_AUTHOR_SOURCE_KINDS) {
      expect(startMapSource(kind).kind).toBe(kind);
    }
  });

  it("every tile carries the words a person reads", () => {
    for (const tile of START_MAP_SOURCES) {
      expect(tile.label.trim().length).toBeGreaterThan(0);
      expect(tile.helper.trim().length).toBeGreaterThan(0);
      expect(tile.launchLabel.trim().length).toBeGreaterThan(0);
      if (tile.control === "text" || tile.control === "resolve") {
        expect(tile.placeholder?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("the wire const carries no labels (the screen owns every word)", () => {
    for (const kind of MAP_AUTHOR_SOURCE_KINDS) {
      expect(typeof kind).toBe("string");
    }
  });

  it("a tile that collects nothing builds a body with nothing typed", () => {
    for (const tile of START_MAP_SOURCES) {
      if (tile.control !== "none" && tile.control !== "site") continue;
      expect(() => authorTopicalMapBody({ brandId: BRAND, sourceKind: tile.kind })).not.toThrow();
      expect(authorTopicalMapBody({ brandId: BRAND, sourceKind: tile.kind })).toEqual({
        source_kind: tile.kind,
      });
    }
  });

  it("a tile that collects text or research is refused locally without it", () => {
    for (const tile of START_MAP_SOURCES) {
      if (tile.control === "none" || tile.control === "site") continue;
      expect(() => authorTopicalMapBody({ brandId: BRAND, sourceKind: tile.kind })).toThrow(
        /needs/,
      );
    }
  });

  it("the resolve tiles send exactly their own field, never a sibling's", () => {
    const documents = authorTopicalMapBody({
      brandId: BRAND,
      sourceKind: "documents",
      documentText: "a service menu",
      // A stale value from a tile the person switched away from must not ride along.
      webSearchText: "leftover",
      prompt: "leftover",
      emphasis: "  data security  ",
    });
    expect(documents).toEqual({
      source_kind: "documents",
      document_text: "a service menu",
      emphasis: "data security",
    });

    const web = authorTopicalMapBody({
      brandId: BRAND,
      sourceKind: "web_search",
      webSearchText: "cleaned page",
      webSearchQuery: "https://example.com/services",
      documentText: "leftover",
    });
    expect(web).toEqual({
      source_kind: "web_search",
      web_search_text: "cleaned page",
      web_search_query: "https://example.com/services",
    });
  });

  it("an unknown kind is refused by name", () => {
    expect(() => startMapSource("carrier_pigeon" as never)).toThrow(/carrier_pigeon/);
  });
});
