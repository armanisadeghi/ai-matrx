/**
 * TRANSITION (PACKAGE-INDEPENDENCE.md §2.2, until P29d): a chat component rendered under a plain
 * react-redux <Provider> with no <ChatProvider> above still reads that store, and says so once.
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
import { Provider } from "react-redux";
import { _resetAnnouncements } from "../../host/errors";
import { useChatDispatch, useChatSelector, useChatStore } from "../hooks";
import { createChatStore } from "../create-chat-store";
import { chatHostSynced } from "../chat-host.slice";
import { DEFAULT_CHAT_PREFERENCES } from "../../host/defaults/prefs";
import { HARBOR_LIGHT, PRIYA } from "./chat-host-test-ports";

it("falls back to the nearest react-redux store and announces it once", () => {
  _resetAnnouncements();
  const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  const store = createChatStore();
  const seen: unknown[] = [];
  function Probe() {
    const dispatch = useChatDispatch();
    seen.push(useChatSelector((s) => s.chatHost.org), useChatStore() === store, typeof dispatch);
    return null;
  }
  render(
    <Provider store={store}>
      <Probe />
      <Probe />
    </Provider>,
  );
  expect(seen.slice(0, 3)).toEqual([null, true, "function"]);
  store.dispatch(
    chatHostSynced({
      identity: PRIYA,
      org: HARBOR_LIGHT,
      server: { baseUrl: "x" },
      prefs: {},
      preferences: DEFAULT_CHAT_PREFERENCES,
    }),
  );
  expect(store.getState().chatHost.org).toEqual(HARBOR_LIGHT);
  expect(info).toHaveBeenCalledTimes(1);
  expect(String(info.mock.calls[0][0])).toContain("outside <ChatProvider>");
  info.mockRestore();
});
