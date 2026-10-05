/**
 * A person can delete a frame (2026-10-04: neither a person nor the agent saw a way). Clicking the
 * frame's label selects it; the trash button beside the label (and Delete / Backspace, through the
 * board's `deleteSelected`) removes the frame as one undoable step — its tiles stay.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BoardFrameView } from "../components/BoardFrameView";
import { BoardCameraStore } from "../engine/camera-store";
import { BoardCameraStoreContext } from "../engine/react";
import { BoardStore } from "../board/board-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RECT = { x: 0, y: 0, w: 400, h: 300 };

describe("deleting a frame", () => {
  it("clicking the label selects the frame and offers Delete, which calls the board's remove", async () => {
    const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    const onRemove = jest.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <BoardCameraStoreContext.Provider value={store}>
          <BoardFrameView id="f1" rect={RECT} title="Move-Out Essentials" onRemove={onRemove} />
        </BoardCameraStoreContext.Provider>,
      ),
    );
    expect(host.querySelector('[aria-label="Delete frame Move-Out Essentials"]')).toBeNull();
    await act(async () => (host.querySelector('[title="Fly to Move-Out Essentials"]') as HTMLButtonElement).click());
    expect(store.getSelected()).toBe("f1");
    const del = host.querySelector('[aria-label="Delete frame Move-Out Essentials"]') as HTMLButtonElement | null;
    expect(del).not.toBeNull();
    await act(async () => del?.click());
    expect(onRemove).toHaveBeenCalledWith("f1");
    act(() => root.unmount());
    host.remove();
  });

  it("removing a frame keeps its tiles and is one undo step", () => {
    const board = new BoardStore<{ id: string; rect: typeof RECT; title: string }>({
      tiles: [{ id: "t1", rect: { x: 10, y: 10, w: 100, h: 100 }, title: "Rooms" }],
      frames: [{ id: "f1", rect: RECT, title: "Move-Out Essentials" }],
    });
    board.removeFrame("f1");
    expect(board.read().frames).toEqual([]);
    expect(board.read().tiles.map((t) => t.id)).toEqual(["t1"]);
    board.undo();
    expect(board.read().frames.map((f) => f.id)).toEqual(["f1"]);
  });
});
