/**
 * Test helper (P9): configure a chat host whose server client carries the
 * members a test needs. Every member the test does not pass is the package
 * default (`../defaults/server-api.ts`) — so a test that reaches a server seam
 * it did not mean to reach fails on the default's network call, never on an
 * unconfigured host.
 */

import { _resetChatHostForTests, configureChat } from "../host/configure";
import type { ChatServerApi, ResolvedChatHost } from "../host/contract";
import { createFakeDb } from "./fake-db";

export function configureServerForTest(
  api: Partial<ChatServerApi>,
  baseUrl = "https://server.test",
): ResolvedChatHost {
  _resetChatHostForTests();
  const host = configureChat({
    db: createFakeDb().db,
    server: { baseUrl: () => baseUrl },
  });
  Object.assign(host.server.api, api);
  return host;
}
