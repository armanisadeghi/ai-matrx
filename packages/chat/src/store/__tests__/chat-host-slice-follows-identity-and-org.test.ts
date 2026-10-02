/**
 * The `chatHost` slice follows the host ports (PACKAGE-INDEPENDENCE.md §2.2, P3): after a sync it
 * holds the person, the active organization, the server and the prefs; a port change reaches the
 * slice; a notification that changes nothing dispatches nothing; unsubscribing stops following.
 */

import { DEFAULT_CHAT_PREFERENCES } from "../../host/defaults/prefs";
import { createChatStore } from "../create-chat-store";
import { followChatHost } from "../chat-host-sync";
import { initialChatHostState, selectChatHostOrgId, selectChatHostPref } from "../chat-host.slice";
import { SIGNED_OUT_IDENTITY } from "../../host/defaults/identity";
import { HARBOR_LIGHT, PRIYA, createTestPorts } from "./chat-host-test-ports";

describe("chatHost slice follows identity and org", () => {
  it("starts unsynced, signed out, with no organization", () => {
    const store = createChatStore();
    expect(store.getState().chatHost).toEqual(initialChatHostState);
    expect(store.getState().chatHost.synced).toBe(false);
  });

  it("holds the ports' values once followed, and every later change", () => {
    const store = createChatStore();
    const ports = createTestPorts({
      identity: SIGNED_OUT_IDENTITY,
      org: null,
      prefs: { "composer.density": "compact" },
    });
    const stop = followChatHost(store, ports.resolved);

    expect(store.getState().chatHost).toEqual({
      synced: true,
      identity: SIGNED_OUT_IDENTITY,
      org: null,
      server: { baseUrl: "https://server.app.matrxserver.com" },
      prefs: { "composer.density": "compact" },
      preferences: DEFAULT_CHAT_PREFERENCES,
    });

    ports.setIdentity(PRIYA);
    expect(store.getState().chatHost.identity).toEqual(PRIYA);

    ports.setOrg(HARBOR_LIGHT);
    expect(selectChatHostOrgId(store.getState())).toBe(HARBOR_LIGHT.id);
    expect(store.getState().chatHost.org).toEqual(HARBOR_LIGHT);

    ports.prefs.set("composer.density", "comfortable");
    expect(selectChatHostPref(store.getState(), "composer.density")).toBe("comfortable");
    ports.prefs.remove("composer.density");
    expect(selectChatHostPref(store.getState(), "composer.density")).toBeNull();

    ports.setOrg(null);
    expect(store.getState().chatHost.org).toBeNull();
    ports.setIdentity(SIGNED_OUT_IDENTITY);
    expect(store.getState().chatHost.identity).toEqual(SIGNED_OUT_IDENTITY);

    stop();
    expect(ports.listenerCount()).toBe(0);
    ports.setIdentity(PRIYA);
    expect(store.getState().chatHost.identity).toEqual(SIGNED_OUT_IDENTITY);
  });

  it("a notification that changes nothing dispatches nothing", () => {
    const store = createChatStore();
    const ports = createTestPorts({ identity: PRIYA, org: HARBOR_LIGHT });
    followChatHost(store, ports.resolved);
    const before = store.getState().chatHost;
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    ports.setIdentity({ ...PRIYA });
    ports.setOrg({ ...HARBOR_LIGHT });
    expect(notified).toBe(0);
    expect(store.getState().chatHost).toBe(before);
  });
});
