/**
 * The builder's layout model is a REDUCTION of the stored document (order +
 * width in, x/y out). Two things must therefore be true forever, and both are
 * the kind of thing that breaks silently:
 *
 * 1. Opening a hand-authored surface must not move a single box. The Study
 *    Pack surface below is the live document (workflow.runtime_surface
 *    c797a1c1…) — if the packer ever disagrees with it, an author opening
 *    that page would watch their layout rearrange itself before they touched
 *    anything.
 * 2. Keys this builder has never heard of must survive a round trip. The
 *    config document is extended additively by other work; a builder that
 *    rebuilds readouts instead of spreading them would silently delete those
 *    fields on the next save.
 */

import { movePanel, normalize, repack } from "../layout-model";
import type { RunSurfaceConfig } from "../../surface/config";

const STUDY_PACK: RunSurfaceConfig = {
  schemaVersion: 1,
  deliverableNodeId: "show",
  pages: [
    { id: "prep", title: "Preparing" },
    { id: "writing", title: "Writing", activateOn: "node:knowledge_text:completed" },
    { id: "pack", title: "Your study pack", activateOn: "deliverable:ready" },
  ],
  readouts: [
    { id: "rail-prep", pageId: "prep", source: { kind: "progressRail" }, pos: { x: 0, y: 0, w: 24, h: 6 } },
    { id: "materials", pageId: "prep", source: { kind: "node", nodeId: "ingest" }, pos: { x: 0, y: 6, w: 12, h: 8 } },
    { id: "knowledge-map", pageId: "prep", source: { kind: "node", nodeId: "structure" }, pos: { x: 12, y: 6, w: 12, h: 8 } },
    { id: "rail-writing", pageId: "writing", source: { kind: "progressRail" }, pos: { x: 0, y: 0, w: 24, h: 6 } },
    { id: "notes", pageId: "writing", source: { kind: "node", nodeId: "notes" }, pos: { x: 0, y: 6, w: 12, h: 10 } },
    { id: "flashcards", pageId: "writing", source: { kind: "node", nodeId: "flashcards" }, pos: { x: 12, y: 6, w: 12, h: 10 } },
    { id: "quiz", pageId: "writing", source: { kind: "node", nodeId: "quiz" }, pos: { x: 0, y: 16, w: 12, h: 10 } },
    { id: "lessons", pageId: "writing", source: { kind: "node", nodeId: "lesson_scripts" }, pos: { x: 12, y: 16, w: 12, h: 10 } },
    { id: "images", pageId: "writing", source: { kind: "node", nodeId: "stock_images" }, pos: { x: 0, y: 26, w: 12, h: 6 } },
    { id: "final", pageId: "pack", source: { kind: "node", nodeId: "show" }, pos: { x: 0, y: 0, w: 24, h: 16 } },
  ],
};

function positions(config: RunSurfaceConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of config.readouts) out[r.id] = `${r.pos.x},${r.pos.y},${r.pos.w},${r.pos.h}`;
  return out;
}

describe("layout-model", () => {
  it("opens a hand-authored surface without moving anything", () => {
    expect(positions(normalize(STUDY_PACK))).toEqual(positions(STUDY_PACK));
  });

  it("keeps each screen on its own grid, starting at the top", () => {
    const packed = normalize(STUDY_PACK);
    const tops = packed.readouts.filter((r) => r.pos.y === 0).map((r) => r.id);
    expect(tops.sort()).toEqual(["final", "rail-prep", "rail-writing"]);
  });

  it("wraps a row rather than letting a box hang off the grid", () => {
    const wide: RunSurfaceConfig = {
      schemaVersion: 1,
      pages: [],
      readouts: [
        { id: "a", source: { kind: "progressRail" }, pos: { x: 0, y: 0, w: 16, h: 6 } },
        { id: "b", source: { kind: "progressRail" }, pos: { x: 0, y: 0, w: 16, h: 6 } },
      ],
    };
    const packed = repack(wide);
    expect(positions(packed)).toEqual({ a: "0,0,16,6", b: "0,6,16,6" });
  });

  it("reorders within a screen and repacks", () => {
    const moved = movePanel(normalize(STUDY_PACK), "knowledge-map", -1);
    expect(positions(moved)["knowledge-map"]).toBe("0,6,12,8");
    expect(positions(moved)["materials"]).toBe("12,6,12,8");
  });

  it("never drops a key it does not recognise", () => {
    const withFuture = {
      ...STUDY_PACK,
      futureTopLevel: "keep me",
      readouts: STUDY_PACK.readouts.map((r) => ({ ...r, futureReadoutKey: r.id })),
    } as RunSurfaceConfig & { futureTopLevel: string };
    const out = normalize(withFuture) as typeof withFuture;
    expect(out.futureTopLevel).toBe("keep me");
    for (const r of out.readouts as Array<{ id: string; futureReadoutKey?: string }>) {
      expect(r.futureReadoutKey).toBe(r.id);
    }
  });
});
