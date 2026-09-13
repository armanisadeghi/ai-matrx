import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { analyzeDiff } from "../utils/diffAnalysis";

jest.mock("@ai-matrx/diff/react", () => ({
  DiffViewer: () => <div>diff</div>,
  DiffReview: () => <div>merge</div>,
}));

import { NoteConflictWindow } from "./NoteConflictWindow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NoteConflictWindow stale comparison controls", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("refuses both decisions after newer evidence and exposes an explicit refresh", async () => {
    const keepMine = jest.fn();
    const accept = jest.fn();
    const refresh = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(<NoteConflictWindow
        noteTitle="Conflict"
        localContent="mine"
        remoteContent="theirs"
        analysis={analyzeDiff("mine", "theirs")}
        remoteDetails={[{ label: "Title", yours: "Mine", saved: "Conflict" }]}
        mergeDraft="mine"
        onMergeDraftChange={jest.fn()}
        stale
        onKeepMine={keepMine}
        onAcceptChanges={accept}
        onCancel={jest.fn()}
        onRefresh={refresh}
      />);
    });
    const buttons = Array.from(host.querySelectorAll("button"));
    const mine = buttons.find((button) => button.textContent === "Keep Mine");
    const theirs = buttons.find((button) => button.textContent === "Accept Changes");
    const refreshButton = buttons.find((button) => button.textContent === "Refresh");
    expect(mine?.disabled).toBe(true);
    expect(theirs?.disabled).toBe(true);
    expect(host.textContent).toContain("newer remote change arrived");
    await act(async () => { refreshButton?.click(); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(keepMine).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });
});
