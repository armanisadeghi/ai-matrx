// SI-13: board templates list built-ins plus the person's labeled boards, and Use goes through the right door.
const listTemplateIds = jest.fn();
const setTemplate = jest.fn();
jest.mock("@/features/spaces/state/templates", () => ({ listTemplateIds: (...a: unknown[]) => listTemplateIds(...a), setTemplate: (...a: unknown[]) => setTemplate(...a) }));

const getBoardsByIds = jest.fn();
const duplicateBoard = jest.fn(async () => ({ id: "copy" }));
const createBoardFromDocument = jest.fn(async () => ({ id: "fresh" }));
jest.mock("../persistence/boardsService", () => ({
  getBoardsByIds: (...a: unknown[]) => getBoardsByIds(...a),
  duplicateBoard: (...a: unknown[]) => duplicateBoard(...(a as [])),
  createBoardFromDocument: (...a: unknown[]) => createBoardFromDocument(...(a as [])),
}));

import { BUILTIN_BOARD_TEMPLATES } from "../templates/builtin";
import { isBoardTemplate, listBoardTemplates, saveBoardAsTemplate, makeBoardFromTemplate } from "../templates/board-templates";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BOARD_PRESETS } from "../presets/registry";

describe("board templates", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the built-ins, then saved boards labeled as templates (source board)", async () => {
    listTemplateIds.mockResolvedValue(["b1"]);
    getBoardsByIds.mockResolvedValue([{ id: "b1", title: "Mine", doc: { nodes: [], groups: [], edges: [], shapes: [], camera: { x: 0, y: 0, z: 1 } } }]);
    const all = await listBoardTemplates();
    expect(listTemplateIds).toHaveBeenCalledWith("board");
    expect(getBoardsByIds).toHaveBeenCalledWith(["b1"]);
    expect(all.map((t) => [t.title, t.builtin])).toEqual([
      ["Viral breakdown", true],
      ["Repurpose one long video into shorts", true],
      ["Competitor swipe file", true],
      ["Mine", false],
    ]);
  });

  it("saves and un-saves through the board source", async () => {
    await saveBoardAsTemplate("b9", true);
    await saveBoardAsTemplate("b9", false);
    expect(setTemplate.mock.calls).toEqual([["b9", true, "board"], ["b9", false, "board"]]);
    expect(isBoardTemplate(["b9"], "b9")).toBe(true);
    expect(isBoardTemplate(null, "b9")).toBe(false);
  });

  it("Use: a saved template is duplicated under its own title; a built-in makes a fresh board", async () => {
    await makeBoardFromTemplate("b1", "org", "Mine");
    expect(duplicateBoard).toHaveBeenCalledWith("b1", { title: "Mine" });
    await makeBoardFromTemplate("builtin:viral-breakdown", "org", "Viral breakdown");
    expect(createBoardFromDocument).toHaveBeenCalledTimes(1);
  });

  it("built-ins use only real tile types, wire lines between real tiles, and mint new ids each use", () => {
    const keys = new Set(BOARD_ITEM_TYPES.map((t) => t.key));
    for (const t of BUILTIN_BOARD_TEMPLATES) {
      const a = t.build();
      const b = t.build();
      const ids = new Set(a.nodes.map((n) => n.id));
      expect(a.nodes.length).toBeGreaterThan(2);
      expect(a.edges.length).toBeGreaterThan(0);
      for (const e of a.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
      for (const n of a.nodes) {
        if (n.source.kind === "entity") expect(keys.has(n.source.entity)).toBe(true);
        else expect(n.source.kind).toBe("text");
      }
      expect(a.nodes[0].id).not.toBe(b.nodes[0].id);
    }
  });

  it("the marketing-social preset starts from a template that exists", () => {
    const starter = BOARD_PRESETS["marketing-social"].starter;
    expect(BUILTIN_BOARD_TEMPLATES.map((t) => t.key)).toContain(starter);
  });
});
