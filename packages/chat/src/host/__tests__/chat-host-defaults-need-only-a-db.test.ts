/**
 * THE ALL-INCLUSIVE LAW for the host contract: given only a db, every port is
 * present and works; a default that cannot do its job says so instead of
 * doing nothing.
 */

import {
  CHAT_PREFS_PREFIX,
  ChatOrganizationRequiredError,
  DEFAULT_CHAT_SERVER_URL,
  SIGNED_OUT_IDENTITY,
  _resetChatHostForTests,
  resolveChatHost,
  type ChatPortName,
} from "../index";
import { _resetAnnouncements } from "../errors";
import { createFakeDb } from "./fake-db";
import { CHAT_WINDOWS } from "../windows";

const ALL_PORTS: ChatPortName[] = [
  "identity",
  "org",
  "server",
  "notify",
  "diagnostics",
  "prefs",
  "navigation",
  "windows",
  "catalog",
  "registry",
];

let warn: jest.SpyInstance;
let error: jest.SpyInstance;
let info: jest.SpyInstance;

beforeEach(() => {
  _resetAnnouncements();
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  document.body.innerHTML = "";
  window.localStorage.clear();
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
  info.mockRestore();
  _resetChatHostForTests();
});

describe("a chat host needs only a db", () => {
  it("resolves every port from { db } alone, and reports none as overridden", () => {
    const { db } = createFakeDb();
    const host = resolveChatHost({ db });
    for (const port of ALL_PORTS) expect(host[port]).toBeDefined();
    expect(host.overridden.size).toBe(0);
    expect(host.sourceApp).toBeNull();
  });

  it("an override replaces only its own port", () => {
    const { db } = createFakeDb();
    const prefs = {
      get: () => "x",
      set: () => undefined,
      remove: () => undefined,
      subscribe: () => () => undefined,
      knob: <T>(_k: string, f: T) => f,
    };
    const host = resolveChatHost({ db, prefs });
    expect(host.prefs).toBe(prefs);
    expect([...host.overridden]).toEqual(["prefs"]);
  });

  it("identity follows the db session", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1", email: "admin@admin.com" });
    const host = resolveChatHost({ db: fake.db });
    expect(host.identity.current()).toBe(SIGNED_OUT_IDENTITY);
    const changed = new Promise<void>((resolve) =>
      host.identity.subscribe(resolve),
    );
    await changed;
    expect(host.identity.current()).toMatchObject({
      userId: "user-1",
      isAuthenticated: true,
      email: "admin@admin.com",
    });
    expect(host.identity.current()).toBe(host.identity.current());
    await expect(host.identity.getAccessToken()).resolves.toBe("token-user-1");
  });

  it("server defaults to the production server and carries the bearer token", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-2" });
    const host = resolveChatHost({ db: fake.db });
    expect(host.server.baseUrl()).toBe(DEFAULT_CHAT_SERVER_URL);
    await expect(host.server.headers?.()).resolves.toEqual({
      Authorization: "Bearer token-user-2",
    });
  });

  it("org never auto-picks: require refuses by name, shows a notice and records it", async () => {
    const { db } = createFakeDb();
    const host = resolveChatHost({ db });
    expect(host.org.active()).toBeNull();
    await expect(host.org.require("send a message")).rejects.toBeInstanceOf(
      ChatOrganizationRequiredError,
    );
    expect(
      document.querySelector("[data-ai-matrx-chat-toaster]")?.textContent,
    ).toMatch(/Choose an organization first/);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("org/chat-organization-required"),
      expect.anything(),
    );
  });

  it("notify shows a notice without any host toaster mounted", () => {
    const { db } = createFakeDb();
    resolveChatHost({ db }).notify.success("Saved");
    const toast = document.querySelector(
      '[data-ai-matrx-chat-toaster] [role="status"]',
    );
    expect(toast?.textContent).toBe("Saved");
  });

  it("prefs persist to browser storage and notify subscribers", () => {
    const { db } = createFakeDb();
    const { prefs } = resolveChatHost({ db });
    const seen: string[] = [];
    prefs.subscribe((key) => seen.push(key));
    prefs.set("density", "compact");
    expect(window.localStorage.getItem(`${CHAT_PREFS_PREFIX}density`)).toBe(
      "compact",
    );
    expect(prefs.get("density")).toBe("compact");
    prefs.set("debug", "true");
    expect(prefs.knob("debug", false)).toBe(true);
    expect(prefs.knob("missing", 3)).toBe(3);
    expect(seen).toEqual(["density", "debug"]);
  });

  it("windows cannot open without a window host and say so once, never silently", () => {
    const { db } = createFakeDb();
    const { windows } = resolveChatHost({ db });
    windows.open(CHAT_WINDOWS.agentRunWindow);
    windows.open(CHAT_WINDOWS.agentRunWindow);
    const notices = warn.mock.calls.filter(([line]) =>
      String(line).includes('Chat window "agentRunWindow" was not opened'),
    );
    expect(notices).toHaveLength(1);
  });

  it("navigation and the registry have working defaults", () => {
    const { db } = createFakeDb();
    const host = resolveChatHost({ db });
    expect(typeof host.navigation.Link).toBe("function");
    expect(host.registry).toEqual({});
  });
});
