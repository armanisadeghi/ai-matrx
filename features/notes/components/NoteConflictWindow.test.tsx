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

  it("shows both reviewed metadata values and immutable folder and organization identities", async () => {
    await act(async () => {
      root.render(<NoteConflictWindow
        noteTitle="Conflict" localContent="mine" remoteContent="theirs"
        analysis={analyzeDiff("mine", "theirs")}
        remoteDetails={[
          { label: "Folder", yours: "Draft (folder-local)", saved: "Draft (folder-remote)" },
          { label: "Organization", yours: "org-local", saved: "org-remote" },
          { label: "Metadata", yours: "1 fields", saved: "1 fields", metadata: { yours: { local: true }, saved: { remote: true } } },
        ]}
        mergeDraft="mine" onMergeDraftChange={jest.fn()} stale={false}
        onKeepMine={jest.fn()} onAcceptChanges={jest.fn()} onCancel={jest.fn()} onRefresh={jest.fn().mockResolvedValue(undefined)}
      />);
    });
    const remote = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Remote Version"));
    await act(async () => { remote?.click(); });
    expect(host.textContent).toContain("folder-local");
    expect(host.textContent).toContain("folder-remote");
    expect(host.textContent).toContain("org-local");
    expect(host.textContent).toContain("org-remote");
    const inspect = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Inspect metadata"));
    await act(async () => { inspect?.click(); });
    expect(host.textContent).toContain("Your metadata");
    expect(host.textContent).toContain('"local": true');
    expect(host.textContent).toContain("Saved metadata");
    expect(host.textContent).toContain('"remote": true');
  });
});
