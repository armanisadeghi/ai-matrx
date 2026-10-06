/**
 * An unconfigured or half-configured chat host never fails silently: every
 * entry point throws a NAMED error that carries the remedy.
 */

import {
  ChatHostInvalidError,
  ChatHostNotConfiguredError,
  _resetChatHostForTests,
  configureChat,
  getChatHost,
  isChatHostConfigured,
  resolveChatHost,
  type ChatHost,
} from "../index";
import { createFakeDb } from "../../testing/fake-db";

afterEach(() => _resetChatHostForTests());

describe("an unconfigured chat host is loud", () => {
  it("getChatHost before configureChat throws ChatHostNotConfiguredError naming the remedy", () => {
    expect(isChatHostConfigured()).toBe(false);
    let caught: unknown;
    try {
      getChatHost();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ChatHostNotConfiguredError);
    expect((caught as ChatHostNotConfiguredError).code).toBe(
      "chat-host-not-configured",
    );
    expect((caught as Error).message).toMatch(
      /<ChatProvider host=\{\{ db \}\}>/,
    );
    expect((caught as Error).message).toMatch(/configureChat/);
  });

  it("a host without db is refused by name, never accepted as a half host", () => {
    expect(() => configureChat({} as ChatHost)).toThrow(ChatHostInvalidError);
    expect(() => configureChat({} as ChatHost)).toThrow(/`db` is missing/);
    expect(isChatHostConfigured()).toBe(false);
  });

  it("a db that is not a Supabase client is refused by name", () => {
    expect(() => resolveChatHost({ db: {} } as unknown as ChatHost)).toThrow(
      /not a Supabase client/,
    );
  });

  it("server-only code resolves a host from an argument without touching the global", () => {
    const { db } = createFakeDb();
    const resolved = resolveChatHost({ db });
    expect(resolved.db).toBe(db);
    expect(isChatHostConfigured()).toBe(false);
    expect(() => getChatHost()).toThrow(ChatHostNotConfiguredError);
  });

  it("configureChat installs the host for non-React code; the same host again is the same resolution", () => {
    const { db } = createFakeDb();
    const host: ChatHost = { db };
    const first = configureChat(host);
    expect(getChatHost()).toBe(first);
    expect(configureChat(host)).toBe(first);
  });
});
