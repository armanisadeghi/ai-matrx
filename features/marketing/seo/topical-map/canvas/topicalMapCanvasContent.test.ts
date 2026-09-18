// features/marketing/seo/topical-map/canvas/topicalMapCanvasContent.test.ts
//
// The `topical_map` canvas pointer (R12): non-persistable, one pane per map,
// and offered by the tool-result registry only for a call that CHANGED the
// map. Watched failing first: with `"topical_map"` absent from
// NON_PERSISTABLE_CANVAS_TYPES the pointer read as persistable — a
// canvas_items row would have frozen a stale copy of a live map.

import { isPersistableCanvasType } from "@/features/canvas/redux/canvasSlice";
import { readToolResultCanvasOffer } from "@/features/canvas/tool-results/toolResultCanvasRegistry";

import {
  buildTopicalMapCanvasContent,
  readTopicalMapCanvasPointer,
  topicalMapCanvasSourceId,
} from "./topicalMapCanvasContent";

describe("topical_map canvas pointer", () => {
  it("is never persisted", () => {
    expect(isPersistableCanvasType("topical_map")).toBe(false);
  });

  it("builds a pointer the body can read back, keyed by map", () => {
    const content = buildTopicalMapCanvasContent({ mapId: "m1", screen: "history", title: " All Green " });
    expect(content.type).toBe("topical_map");
    expect(content.metadata?.title).toBe("All Green");
    expect(content.metadata?.sourceMessageId).toBe(topicalMapCanvasSourceId("m1"));
    expect(readTopicalMapCanvasPointer(content.data)).toEqual({ mapId: "m1", screen: "history", siteId: null });
    expect(readTopicalMapCanvasPointer({ mapId: "m1", screen: "nope" })?.screen).toBe("outline");
    expect(readTopicalMapCanvasPointer({})).toBeNull();
  });

  it("is offered for a topical_map call that changed the map, never for a read", () => {
    const write = readToolResultCanvasOffer("topical_map", {
      action: "upsert",
      map_id: "m1",
      created: ["a"],
    });
    expect(write?.sourceId).toBe(topicalMapCanvasSourceId("m1"));
    expect(write?.content.type).toBe("topical_map");

    const created = readToolResultCanvasOffer("topical_map", {
      action: "create_map",
      map: { id: "m2", name: "Factory Playground" },
    });
    expect(created?.label).toBe("Factory Playground");

    expect(readToolResultCanvasOffer("topical_map", { action: "tree", map_id: "m1", topics: [] })).toBeNull();
    expect(readToolResultCanvasOffer("topical_map", { action: "upsert" })).toBeNull();
  });
});
