/**
 * The server seam (PACKAGE-INDEPENDENCE §2.1, slice P9) — how every package
 * call to the AI Matrx server reaches the configured host's server client.
 *
 * `./server/*` holds one seam module per host module the call sites used to
 * import (`call-api`, `matrx-transport`, `api-config`, …), with the same
 * export names, so moving a call site onto the server port changed only its
 * import specifier — and a test's `jest.mock` of one seam module replaces
 * exactly what the host module's mock replaced before.
 *
 * Every export forwards at CALL time, never at import: matrx-frontend supplies
 * its own `lib/api` (`providers/ChatHostAdapter.tsx`, typed by registration in
 * `lib/api/chat-server-api.ts`); a bare host gets the package default over
 * `@ai-matrx/agents/matrx` (`./defaults/server-api.ts`). Used before any host
 * is configured, it throws `ChatHostNotConfiguredError`, which names the remedy.
 *
 * Pure server keepers (errors, endpoint paths, run-wait arithmetic) are not
 * here: call sites import those from `@ai-matrx/agents/matrx` directly.
 */

import { getChatHost } from "./configure";
import type { ChatServerApi, ChatServerTypes } from "./contract";

export type { ChatServerApi, ChatServerTypes };

/** The configured host's server client. */
export function serverApi(): ChatServerApi {
  return getChatHost().server.api;
}

type ServerMember = keyof ChatServerApi;

/**
 * A stable function that calls the configured host's `member` with the same
 * arguments — typed exactly as the registered member, generics included.
 */
export function forwardServer<K extends ServerMember>(member: K): ChatServerApi[K] {
  const forwarded = (...args: unknown[]): unknown => {
    const target = serverApi()[member] as unknown as (...a: unknown[]) => unknown;
    return target(...args);
  };
  // One assertion, here only: a rest-args forwarder IS the member's call
  // signature (generic members included), which TypeScript cannot express.
  return forwarded as unknown as ChatServerApi[K];
}
