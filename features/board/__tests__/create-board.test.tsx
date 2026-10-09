// "New board" is ONE path that creates AND opens the board. The title menu on /board used to
// create a board and not navigate (a silent "Untitled board" per click). Fails when either
// surface stops going through useCreateBoard, or the hook stops opening what it created.

import fs from "fs";
import path from "path";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
let currentPath = "/board";
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => currentPath }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "org-1" }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "org-1" }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), warning: jest.fn() } }));
const beginBoardCreate = jest.fn();
jest.mock("../persistence/boardsService", () => ({
  beginBoardCreate: (...a: unknown[]) => beginBoardCreate(...a),
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
  currentPath = "/board";
  push.mockClear();
  beginBoardCreate.mockReset();
});

describe("useCreateBoard", () => {
  it("opens the board it created", async () => {
    beginBoardCreate.mockResolvedValue({ id: "b9" });
    const { result } = renderHook(() => useCreateBoard());
    await act(async () => {
      await result.current.newBoard();
    });
    expect(push).toHaveBeenCalledWith("/board/b9");
  });

  it("ignores a second click while one board is being made", async () => {
    let resolve!: (b: { id: string }) => void;
    beginBoardCreate.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useCreateBoard());
    await act(async () => {
      void result.current.newBoard();
      void result.current.newBoard();
      resolve({ id: "b1" });
    });
    expect(beginBoardCreate).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("New board opens at once (optimistic)", () => {
  it("navigates with the minted id without waiting for the insert, and a double click after it still makes one board", async () => {
    beginBoardCreate.mockResolvedValue({ id: "minted-1" });
    const { result } = renderHook(() => useCreateBoard());
    await act(async () => {
      await result.current.newBoard();
    });
    expect(push).toHaveBeenCalledWith("/board/minted-1");
    await act(async () => {
      await result.current.newBoard(); // a second click while the route is changing
    });
    expect(beginBoardCreate).toHaveBeenCalledTimes(1);
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

describe("a slow route change never invites a second board", () => {
  it("stays busy past the old 2 second window until the page is at the new board", async () => {
    jest.useFakeTimers();
    try {
      beginBoardCreate.mockResolvedValue({ id: "slow-1" });
      const { result } = renderHook(() => useCreateBoard());
      await act(async () => {
        await result.current.newBoard();
      });
      expect(push).toHaveBeenCalledWith("/board/slow-1");
      await act(async () => {
        jest.advanceTimersByTime(10_000); // the route is still compiling: the list is still showing
      });
      expect(result.current.creating).toBe(true);
      await act(async () => {
        await result.current.newBoard();
      });
      expect(beginBoardCreate).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("after the open gives up (a cold compile past 30 s), a second press opens the SAME board, never a second one", async () => {
    jest.useFakeTimers();
    try {
      beginBoardCreate.mockResolvedValue({ id: "cold-1" });
      const { result } = renderHook(() => useCreateBoard());
      await act(async () => {
        await result.current.newBoard();
      });
      await act(async () => {
        jest.advanceTimersByTime(31_000); // the give-up fires; the button is enabled again
      });
      expect(result.current.creating).toBe(false);
      await act(async () => {
        await result.current.newBoard();
      });
      expect(beginBoardCreate).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenLastCalledWith("/board/cold-1");
    } finally {
      jest.useRealTimers();
    }
  });

  it("is free again once the board is open", async () => {
    beginBoardCreate.mockResolvedValue({ id: "ok-1" });
    const el = document.createElement("div");
    const result = { current: undefined as unknown as ReturnType<typeof useCreateBoard> };
    function Probe() {
      result.current = useCreateBoard();
      return null;
    }
    const root = createRoot(el);
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await result.current.newBoard();
    });
    expect(result.current.creating).toBe(true);
    currentPath = "/board/ok-1";
    await act(async () => root.render(<Probe />));
    expect(result.current.creating).toBe(false);
  });
});
