/**
 * A person can delete a frame (2026-10-04: neither a person nor the agent saw a way). A selected
 * frame is deleted from the selection toolbar or with Delete / Backspace (the board's
 * `deleteSelected`); either removes the frame as one undoable step — its tiles stay.
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
  it("a selected frame has ONE delete (the selection toolbar's), none beside its label", async () => {
    const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <BoardCameraStoreContext.Provider value={store}>
          <BoardFrameView id="f1" rect={RECT} title="Move-Out Essentials" />
        </BoardCameraStoreContext.Provider>,
      ),
    );
    await act(async () => store.select("f1"));
    expect(host.querySelector('[aria-label^="Delete frame"]')).toBeNull();
    expect(host.querySelector("[data-board-frame-strip] button")).toBeNull();
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
