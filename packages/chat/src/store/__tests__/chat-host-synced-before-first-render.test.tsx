/**
 * <ChatProvider>'s first render already holds the host's values in `chatHost`
 * (PACKAGE-INDEPENDENCE.md P3): a child reading identity / org / prefs on its very first render
 * sees the person, the active organization and the prefs — never the empty default it would
 * otherwise paint for one frame. Proven for both store modes: a private store, and an app's own
 * store handed in (`store`).
 *
 * P7: the package's identity and org readers (`host/identity`, `host/org`) follow the host on
 * every later render too — an organization switch and a sign-out reach React and non-React
 * readers together.
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
import { SIGNED_OUT_IDENTITY } from "../../host/defaults/identity";
import { getUserId, selectIsAuthenticated, selectUserId } from "../../host/identity";
import { getActiveOrgId, selectOrganizationId, selectOrganizationName } from "../../host/org";

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

/** A second organization Priya belongs to. */
const LAKESIDE_ORTHO = {
  id: "2c9e7b14-5a3f-4d68-8e01-b7f4c2a9d356",
  name: "Lakeside Orthodontics",
};

describe("the package's identity and org reads follow the host after the first render (P7)", () => {
  it.each([
    ["a private store", undefined],
    ["the app's own store", createChatStore()],
  ])("%s: an org switch and a sign-out reach every reader on the next render", (_mode, store) => {
    const ports = createTestPorts({ identity: PRIYA, org: HARBOR_LIGHT });
    const seen: Array<{ userId: string | null; signedIn: boolean; orgId: string | null; orgName: string | null }> = [];
    function Reader() {
      seen.push({
        userId: useChatSelector(selectUserId),
        signedIn: useChatSelector(selectIsAuthenticated),
        orgId: useChatSelector(selectOrganizationId),
        orgName: useChatSelector(selectOrganizationName),
      });
      return null;
    }
    render(
      <ChatProvider host={ports.host} store={store}>
        <Reader />
      </ChatProvider>,
    );
    // First render: the person and the active organization, never the empty default.
    expect(seen[0]).toEqual({
      userId: PRIYA.userId,
      signedIn: true,
      orgId: HARBOR_LIGHT.id,
      orgName: HARBOR_LIGHT.name,
    });

    act(() => ports.setOrg(LAKESIDE_ORTHO));
    expect(seen.at(-1)).toEqual({
      userId: PRIYA.userId,
      signedIn: true,
      orgId: LAKESIDE_ORTHO.id,
      orgName: LAKESIDE_ORTHO.name,
    });
    // Non-React code reads the same organization at the same moment.
    expect(getActiveOrgId()).toBe(LAKESIDE_ORTHO.id);

    act(() => {
      ports.setIdentity(SIGNED_OUT_IDENTITY);
      ports.setOrg(null);
    });
    expect(seen.at(-1)).toEqual({ userId: null, signedIn: false, orgId: null, orgName: null });
    expect(getUserId()).toBeNull();
    expect(getActiveOrgId()).toBeNull();
    // No render ever showed the new organization with the old person or the reverse.
    for (const frame of seen) {
      if (frame.orgId === LAKESIDE_ORTHO.id) expect(frame.userId).toBe(PRIYA.userId);
    }
  });
});
