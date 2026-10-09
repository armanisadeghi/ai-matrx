// A Studio board made before starters filed their own notes: a note tile whose note is gone is re-seeded from the
// starter (or dropped with its lines when the starter has no such tile); a readable note is never touched.
jest.mock("@/features/board/persistence/boardsService", () => ({ getBoard: jest.fn(), saveBoardDocument: jest.fn() }));
jest.mock("../studio/studio-boards", () => ({ STUDIO_STARTER_TEMPLATE: "builtin:viral-breakdown" }));

import { hasProfileTiles, repairDanglingNotes } from "../studio/studio-repair";
import type { BoardDocument, BoardNode } from "@/features/board/board/document";

const noteTile = (id: string, title: string, noteId: string): BoardNode => ({
  id,
  rect: { x: 0, y: 0, w: 10, h: 10 },
  title,
  source: { kind: "entity", entity: "note", id: noteId },
});
const doc = (nodes: BoardNode[], edges: BoardDocument["edges"] = []): BoardDocument => ({ camera: { x: 0, y: 0, z: 1 }, nodes, groups: [], edges, shapes: [] });

describe("repairDanglingNotes", () => {
  const held = { title: "Why it worked", seed: "Why it worked\n\nHook (first 3 seconds):\n" };
  const seeds = new Map([["Why it worked", held], ["Hook (first 3 seconds)", held]]);

  it("re-seeds a missing starter note, leaves a readable one alone", () => {
    const d = doc([noteTile("a", "Why it worked", "gone"), noteTile("b", "My own", "fine")]);
    const out = repairDanglingNotes(d, new Set(["gone"]), seeds);
    expect((out.nodes[0].source as { id: unknown; meta?: { seed?: string } }).id).toBeNull();
    expect((out.nodes[0].source as { meta?: { seed?: string } }).meta?.seed).toContain("Hook");
    expect(out.nodes[1]).toBe(d.nodes[1]);
  });

  it("recognises the tile an old starter renamed after its first form line, and gives it its real name back", () => {
    const d = doc([noteTile("a", "Hook (first 3 seconds):", "gone")]);
    const out = repairDanglingNotes(d, new Set(["gone"]), seeds);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].title).toBe("Why it worked");
  });

  it("drops a missing note the starter does not know, with its lines", () => {
    const d = doc([noteTile("a", "Unknown", "gone"), noteTile("b", "Other", "fine")], [{ id: "e", from: "b", to: "a" }]);
    const out = repairDanglingNotes(d, new Set(["gone"]), seeds);
    expect(out.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(out.edges).toHaveLength(0);
  });

  it("changes nothing when no note is missing", () => {
    const d = doc([noteTile("a", "Why it worked", "fine")]);
    expect(repairDanglingNotes(d, new Set(), seeds)).toBe(d);
  });

  it("knows whether the board holds any account tile", () => {
    const profile: BoardNode = { id: "p", rect: { x: 0, y: 0, w: 1, h: 1 }, title: "@a", source: { kind: "entity", entity: "social-profile", id: "x" } };
    expect(hasProfileTiles(doc([profile]))).toBe(true);
    expect(hasProfileTiles(doc([noteTile("a", "t", "n")]))).toBe(false);
  });
});
