// "New board" is ONE path that creates AND opens the board. The title menu on /board used to
// create a board and not navigate (a silent "Untitled board" per click). Fails when either
// surface stops going through useCreateBoard, or the hook stops opening what it created.

import fs from "fs";
import path from "path";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "org-1" }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "org-1" }));
jest.mock("@/lib/organization/organization-gate", () => ({ isOrganizationSelectionCancelled: () => false }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
const createBoard = jest.fn();
jest.mock("../persistence/boardsService", () => ({
  createBoard: (...a: unknown[]) => createBoard(...a),
  boardHref: (b: { id: string }) => `/board/${b.id}`,
  isBoardError: () => false,
}));

import { useCreateBoard } from "../persistence/useCreateBoard";

function renderHook<T>(use: () => T) {
  const result = { current: undefined as unknown as T };
  function Probe() {
    result.current = use();
    return null;
  }
  const el = document.createElement("div");
  act(() => createRoot(el).render(<Probe />));
  return { result };
}

beforeEach(() => {
  push.mockClear();
  createBoard.mockReset();
});

describe("useCreateBoard", () => {
  it("opens the board it created", async () => {
    createBoard.mockResolvedValue({ id: "b9" });
    const { result } = renderHook(() => useCreateBoard());
    await act(async () => {
      await result.current.newBoard();
    });
    expect(push).toHaveBeenCalledWith("/board/b9");
  });

  it("ignores a second click while one board is being made", async () => {
    let resolve!: (b: { id: string }) => void;
    createBoard.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useCreateBoard());
    await act(async () => {
      void result.current.newBoard();
      void result.current.newBoard();
      resolve({ id: "b1" });
    });
    expect(createBoard).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("both New board doors use the one path", () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  it.each(["home/BoardPage.tsx", "boards/BoardsListPage.tsx"])("%s", (f) => {
    const src = read(f);
    expect(src).toContain("useCreateBoard");
    expect(src).not.toMatch(/\bcreateBoard\(/);
  });
});
