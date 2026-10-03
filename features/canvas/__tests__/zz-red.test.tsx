/**
 * "Detail about a thing" opens IN THE CANVAS — a war room's and a thread's
 * resources, a content plan's "What the AI sees", a knowledge-graph entity's
 * evidence and a discovered YouTube video — never a Sheet, a Drawer, a
 * fixed modal or a docked side column.
 *
 * The two kinds are driven for real over the root reducer and the ONE canvas
 * binding (their bodies mocked): a launcher press opens the tab with the right
 * body, a second press closes it. The two page panels are read from source.
 *
 * Proven failing before passing: with either kind left out of
 * FEATURE_CANVAS_KINDS its body case is RED; every source case is RED on the
 * pre-canvas files (Sheet / fixed dialog / a w-80 side column).
 */

import React, { act, useEffect } from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn, useCanvas } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { useToolToggle, type ToolToggleInput } from "@/features/canvas/host/toolCanvas";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  roomResourcesOpenInput,
  threadResourcesToggleInput,
} from "@/features/war-room/canvas/warRoomResourcesKind";
import { agentPayloadToggleInput } from "@/features/marketing/content-plan/canvas/agentPayloadKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("@/features/canvas/host/featureCanvasKinds", () => ({ registerFeatureCanvasKinds: () => () => undefined, FEATURE_CANVAS_KINDS: [] }));
jest.mock("next/navigation", () => ({
  usePathname: () => "/war-room/r-1",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/war-room/components/thread/ThreadResourcesTab", () => ({
  ThreadResourcesTab: ({ threadId }: { threadId: string }) => <p data-body="thread">{threadId}</p>,
}));
jest.mock("@/features/war-room/components/resources/WarRoomResourcesList", () => ({
  WarRoomResourcesList: ({ scopeKey }: { scopeKey: string }) => <p data-body="room">{scopeKey}</p>,
}));
jest.mock("@/features/war-room/hooks/useThreadResourcesAdapter", () => ({
  useRoomResourcesAdapter: () => ({}),
}));
jest.mock("@/features/marketing/content-plan/components/AgentPayloadView", () => ({
  AgentPayloadView: ({ siteId, nodeId }: { siteId: string; nodeId: string | null }) => (
    <p data-body="payload">{`${siteId}/${nodeId ?? "plan"}`}</p>
  ),
}));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

async function pressTwice(input: ToolToggleInput, body: string, expected: string) {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { tab: { isVisible: boolean; toggle: () => void } | null } = { tab: null };
  function Launcher() {
    const canvas = useCanvas();
    useEffect(() => canvas.registerPresentation(), [canvas]);
    seen.tab = useToolToggle(input);
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <TooltipProvider>
            <CanvasHostProvider>
              <CanvasColumn />
              <Launcher />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  const id = `${input.kind}::${input.key}`;
  act(() => seen.tab?.toggle());
  await flush();
  expect(store.getState().canvasHost.items[id]?.title).toBe(input.title);
  expect(seen.tab?.isVisible).toBe(true);
  expect(document.querySelector(`[data-body="${body}"]`)?.textContent).toBe(expected);
  act(() => seen.tab?.toggle());
  expect(store.getState().canvasHost.items[id]).toBeUndefined();
  act(() => root.unmount());
  container.remove();
}

it("a thread's paperclip toggles its resources tab", async () => {
  await pressTwice(threadResourcesToggleInput("t-1", "Pricing"), "thread", "t-1");
});

it("the room's resources open in the room's tab", async () => {
  await pressTwice({ ...roomResourcesOpenInput("r-1") }, "room", "r-1");
});

it("See what the AI sees toggles the plan payload tab", async () => {
  await pressTwice(agentPayloadToggleInput("s-1", "n-1", "/blog/a"), "payload", "s-1/n-1");
});

it("the graph's entity evidence and a YouTube preview are the page's canvas tab; the sheets are gone", () => {
  const root = join(__dirname, "..", "..");
  const read = (file: string) => readFileSync(join(root, file), "utf8");
  expect(read("kg-graph/components/KgGraphCanvas.tsx")).toContain("<CanvasPagePanel");
  expect(read("marketing/discovery/youtube/YouTubeVideoPreview.tsx")).toContain("<CanvasPagePanel");
  expect(read("marketing/discovery/youtube/YouTubeVideoPreview.tsx")).not.toContain('aria-modal="true"');
  expect(read("marketing/content-plan/components/AgentPayloadView.tsx")).not.toContain("SheetContent");
  expect(read("war-room/components/room/RoomHeader.tsx")).not.toContain("RoomResourcesSheet");
  expect(existsSync(join(root, "war-room/components/room/RoomResourcesButton.tsx"))).toBe(false);
  expect(existsSync(join(root, "war-room/components/thread/ThreadResourcesSheet.tsx"))).toBe(false);
});
