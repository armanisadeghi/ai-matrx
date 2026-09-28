/**
 * GUARD — a link to a thread OPENS that thread (chair ruling 2026-09-26, as
 * Slack and Linear do), in its Chat view when it has chat.
 *
 * MEASURED: `/war-room/<room>?thread=<id>` cold landed on the thread LIST. The
 * URL push ran before the tiles loaded, wrote `thread: null` and erased the
 * param; the later hydrate then found no thread to open. When the session row
 * happened to name the same thread it was only highlighted, never opened.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THREAD = "8d1d6955-5e45-4931-a815-ef8a5f8136aa";
let visible: string[] = [];
let conversations: string[] = [];
const dispatched: unknown[] = [];
const commits: Array<Record<string, unknown>> = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector(undefined),
  useAppDispatch: () => (action: unknown) => dispatched.push(action),
}));
jest.mock("@/features/war-room/redux/selectors", () => ({
  selectOrderedGalleryThreadIds: () => () => visible,
  selectConversationIdsForThread: (id: string | null) => () => (id ? conversations : []),
}));
jest.mock("@/features/war-room/redux/slice", () => ({
  setThreadActiveTab: (payload: unknown) => ({ type: "warRoom/setThreadActiveTab", payload }),
}));
jest.mock("@ai-matrx/kit/url-state", () => ({
  commitUrlParams: (params: Record<string, unknown>) => commits.push(params),
}));

import { RoomViewProvider, useRoomView } from "../roomViewContext";
import { useRoomUrlSync } from "../useRoomUrlSync";

let seen: { open: boolean; chosen: string | null } | null = null;
let closeDetail: () => void = () => undefined;
function Probe() {
  useRoomUrlSync("room-1");
  const v = useRoomView();
  seen = { open: v.threadDetailOpen, chosen: v.chosenStageId };
  closeDetail = v.closeThreadDetail;
  return null;
}

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<RoomViewProvider><Probe /></RoomViewProvider>));
  return root;
}

beforeEach(() => {
  visible = [];
  conversations = [];
  dispatched.length = 0;
  commits.length = 0;
  window.history.replaceState(null, "", `/war-room/room-1?thread=${THREAD}`);
});

describe("?thread= deep link", () => {
  it("is never erased while the tiles load, then opens the thread — Chat first when it has chat", () => {
    const root = mount();
    // Tiles not loaded yet: nothing may write thread:null over the link.
    expect(commits.filter((c) => c.thread === null)).toEqual([]);
    expect(seen?.open).toBe(false);

    visible = [THREAD, "other"];
    act(() => root.render(<RoomViewProvider><Probe /></RoomViewProvider>));
    expect(seen).toEqual({ open: true, chosen: THREAD });

    conversations = ["conv-1"];
    act(() => root.render(<RoomViewProvider><Probe /></RoomViewProvider>));
    expect(dispatched).toContainEqual({ type: "warRoom/setThreadActiveTab", payload: { id: THREAD, tab: "agent" } });
  });

  it("a thread with no chat opens in its own view (no tab change)", () => {
    const root = mount();
    visible = [THREAD];
    act(() => root.render(<RoomViewProvider><Probe /></RoomViewProvider>));
    expect(seen?.open).toBe(true);
    expect(dispatched).toEqual([]);
  });

  it("Back to the list drops ?thread= from the address, so a reload shows the list", () => {
    const root = mount();
    visible = [THREAD];
    act(() => root.render(<RoomViewProvider><Probe /></RoomViewProvider>));
    expect(seen?.open).toBe(true);
    act(() => closeDetail());
    expect(seen?.open).toBe(false);
    expect(commits[commits.length - 1]?.thread).toBeNull();
  });
});
