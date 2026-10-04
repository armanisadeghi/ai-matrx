/**
 * The Board's agent-facing text must put the two-request path first (Arman,
 * 2026-10-04: "it first requests that item and it gets the state and controls
 * for it"). Real run: the agent began with knowledge_search and a refused
 * apply_surface_write before it ever called board_read. This pins the three
 * places a model reads about reaching an item that is not live.
 */
import { boardManifest } from "@/features/surfaces/manifests/board.manifest";

describe("the Board manifest points every agent at board_open_item / board_item_act", () => {
  it("states it in the hint that rides on apply_surface_write and its refusal", () => {
    expect(boardManifest.otherItemsHint).toContain("board_open_item");
    expect(boardManifest.otherItemsHint).toContain("board_item_act");
    expect(boardManifest.otherItemsHint).toContain("knowledge_search");
  });

  it("states it on the board_items value, where the list of items is read", () => {
    const value = boardManifest.values.find((v) => v.name === "board_items");
    expect(value?.description).toContain("board_open_item");
    expect(value?.description).toContain("knowledge_search");
    expect(value?.description).toContain("apply_surface_write");
  });

  it("states it in the surface intro", () => {
    expect(boardManifest.intro).toContain("NOT found by knowledge_search");
  });
});
