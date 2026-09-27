import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { MeetingRecord, RoomName } from "@ai-matrx/meet/react";
import { MeetingLayout } from "./MeetingLayout";

let mockPhase = "connected";

jest.mock("@ai-matrx/meet/react", () => ({
  MeetingRoom: ({ headerControls }: { headerControls?: React.ReactNode }) => (
    <div data-testid="package-room">{headerControls}</div>
  ),
  useMeetSnapshot: () => ({ phase: mockPhase, meeting: null }),
}));
jest.mock("@/features/meet/components/board/MeetingBoard", () => ({
  MeetingBoard: ({ onLayout }: { onLayout: (next: "room" | "board") => void }) => (
    <button type="button" data-testid="meeting-board" onClick={() => onLayout("room")} />
  ),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const meeting = { id: "m-1", slug: "m-1", title: "Weekly" } as unknown as MeetingRecord;

function renderLayout() {
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <MeetingLayout roomName={"room-1" as RoomName} meetingId="m-1" slug="m-1" meeting={meeting} />,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("MeetingLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPhase = "connected";
  });

  it("defaults to the package's room, with the layout switch while connected", () => {
    const view = renderLayout();
    expect(view.container.querySelector('[data-testid="package-room"]')).not.toBeNull();
    expect(view.container.querySelector('[role="radiogroup"]')).not.toBeNull();
    view.unmount();
  });

  it("switches to the Board, remembers it, and switches back", () => {
    const view = renderLayout();
    const board = [...view.container.querySelectorAll('[role="radio"]')].find(
      (b) => b.textContent === "Board",
    ) as HTMLButtonElement;
    act(() => board.click());
    expect(view.container.querySelector('[data-testid="meeting-board"]')).not.toBeNull();
    expect(window.localStorage.getItem("matrx.meet.layout")).toBe("board");
    act(() => (view.container.querySelector('[data-testid="meeting-board"]') as HTMLButtonElement).click());
    expect(view.container.querySelector('[data-testid="package-room"]')).not.toBeNull();
    expect(window.localStorage.getItem("matrx.meet.layout")).toBe("room");
    view.unmount();
  });

  it("never replaces pre-join, lobby or the record: outside the room it is always the package's", () => {
    window.localStorage.setItem("matrx.meet.layout", "board");
    for (const phase of ["idle", "lobby", "left", "failed"]) {
      mockPhase = phase;
      const view = renderLayout();
      expect(view.container.querySelector('[data-testid="package-room"]')).not.toBeNull();
      expect(view.container.querySelector('[data-testid="meeting-board"]')).toBeNull();
      expect(view.container.querySelector('[role="radiogroup"]')).toBeNull();
      view.unmount();
    }
  });

  it("hydrates the server-safe Room default before restoring a saved Board preference", async () => {
    window.localStorage.setItem("matrx.meet.layout", "board");
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <MeetingLayout roomName={"room-1" as RoomName} meetingId="m-1" slug="m-1" meeting={meeting} />,
    );
    document.body.append(container);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(
        container,
        <MeetingLayout roomName={"room-1" as RoomName} meetingId="m-1" slug="m-1" meeting={meeting} />,
      );
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="meeting-board"]')).not.toBeNull();
    consoleError.mockRestore();
    act(() => root.unmount());
    container.remove();
  });
});
