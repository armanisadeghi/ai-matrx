/**
 * <ChatProvider>'s first render already holds the host's values in `chatHost`
 * (PACKAGE-INDEPENDENCE.md P3): a child reading identity / org / prefs on its very first render
 * sees the person, the active organization and the prefs — never the empty default it would
 * otherwise paint for one frame. Proven for both store modes: a private store, and an app's own
 * store handed in (`store`).
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
function render(ui: ReactNode): void {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  act(() => root.render(ui));
}
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});
import { ChatProvider } from "../../host/react";
import { _resetChatHostForTests } from "../../host/configure";
import { _resetAnnouncements } from "../../host/errors";
import { useChatSelector, useChatStore } from "../hooks";
import { createChatStore } from "../create-chat-store";
import { selectChatHost, type ChatHostState } from "../chat-host.slice";
import { HARBOR_LIGHT, PRIYA, createTestPorts } from "./chat-host-test-ports";

function renderFirstPaint(store?: ReturnType<typeof createChatStore>) {
  const ports = createTestPorts({
    identity: PRIYA,
    org: HARBOR_LIGHT,
    prefs: { "composer.density": "compact" },
  });
  const renders: ChatHostState[] = [];
  const stores: unknown[] = [];
  function Probe() {
    renders.push(useChatSelector(selectChatHost));
    stores.push(useChatStore());
    return null;
  }
  render(
    <ChatProvider host={ports.host} store={store}>
      <Probe />
    </ChatProvider>,
  );
  return { renders, stores, ports };
}

let info: jest.SpyInstance;
beforeEach(() => {
  _resetChatHostForTests();
  _resetAnnouncements();
  info = jest.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => info.mockRestore());

describe("chatHost is synced before the first render", () => {
  it.each([
    ["a private store", undefined],
    ["the app's own store", createChatStore()],
  ])("%s: the first render sees identity, organization and prefs", (_mode, store) => {
    const { renders, stores } = renderFirstPaint(store);
    expect(renders[0]).toEqual({
      synced: true,
      identity: PRIYA,
      org: HARBOR_LIGHT,
      server: { baseUrl: "https://server.app.matrxserver.com" },
      prefs: { "composer.density": "compact" },
    });
    if (store) expect(stores[0]).toBe(store);
    // Read through the chat store context — never the react-redux fallback.
    expect(info).not.toHaveBeenCalled();
  });
});
