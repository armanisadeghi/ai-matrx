// The brand's Studio board is ONE row, held by the database (unique link), not by client timing.
const rows: Array<Record<string, unknown>> = [];
let readResult: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };
const chain = {
  select: () => chain,
  eq: () => chain,
  is: () => chain,
  contains: () => chain,
  order: () => chain,
  limit: () => Promise.resolve(readResult),
  then: (resolve: (v: unknown) => void) => resolve(readResult),
};
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/projectsDb", () => ({ projectsDb: () => ({ from: () => chain }) }));

const makeBoardFromTemplate = jest.fn();
jest.mock("@/features/board/templates/board-templates", () => ({
  makeBoardFromTemplate: (...a: unknown[]) => makeBoardFromTemplate(...a),
}));

import { BoardError } from "@/features/board/persistence/boardsService";
import { getOrCreateStudioBoard, orderStudioBoards } from "../studio/studio-boards";

const ARGS = { organizationId: "org", brandId: "brand", title: "Brand Studio" };

describe("the Studio board of a brand", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rows.length = 0;
    readResult = { data: [], error: null };
  });

  it("lists the Studio board first, whatever else was opened or made after it", () => {
    const list = orderStudioBoards(
      [
        { id: "copy", title: "Viral breakdown — Oct 9", last_opened_at: "2026-10-09", settings: { brand_id: "brand" } },
        { id: "studio", title: "Brand Studio", last_opened_at: null, settings: { brand_id: "brand", studio_brand_id: "brand" } },
      ],
      "brand",
    );
    expect(list.map((b) => [b.id, b.canonical])).toEqual([["studio", true], ["copy", false]]);
  });

  it("makes the board with the Studio link stored in the SAME write", async () => {
    makeBoardFromTemplate.mockResolvedValue({ id: "new", title: "Brand Studio" });
    const board = await getOrCreateStudioBoard(ARGS);
    expect(board).toMatchObject({ id: "new", canonical: true });
    expect(makeBoardFromTemplate).toHaveBeenCalledWith("builtin:viral-breakdown", "org", "Brand Studio", {
      brand_id: "brand",
      studio_brand_id: "brand",
    });
  });

  it("two opens at once make one board (one in-flight create per brand)", async () => {
    makeBoardFromTemplate.mockResolvedValue({ id: "new", title: "Brand Studio" });
    const [a, b] = await Promise.all([getOrCreateStudioBoard(ARGS), getOrCreateStudioBoard(ARGS)]);
    expect(a.id).toBe(b.id);
    expect(makeBoardFromTemplate).toHaveBeenCalledTimes(1);
  });

  it("when the database refuses a second Studio board, it returns the winner instead of failing", async () => {
    makeBoardFromTemplate.mockRejectedValue(new BoardError("conflict", "That board already exists.", "Open the existing one."));
    // first read finds none; the re-read after the refusal finds the other tab's board
    let reads = 0;
    Object.defineProperty(chain, "limit", {
      configurable: true,
      value: () => Promise.resolve({ data: reads++ === 0 ? [] : [{ id: "winner", title: "Brand Studio", last_opened_at: null, settings: {} }], error: null }),
    });
    const board = await getOrCreateStudioBoard(ARGS);
    expect(board).toMatchObject({ id: "winner", canonical: true });
  });

  it("an existing Studio board is returned without making another", async () => {
    Object.defineProperty(chain, "limit", {
      configurable: true,
      value: () => Promise.resolve({ data: [{ id: "have", title: "Brand Studio", last_opened_at: null, settings: {} }], error: null }),
    });
    const board = await getOrCreateStudioBoard(ARGS);
    expect(board.id).toBe("have");
    expect(makeBoardFromTemplate).not.toHaveBeenCalled();
  });
});
