/**
 * Test-env: give `@ai-matrx/chat` the database a suite wants it to read.
 *
 * The published package reaches its database through the chat HOST
 * (`getChatHost().db`), and its dist files import `host/db` by a RELATIVE path -- so a
 * `jest.mock("@ai-matrx/chat/host/db", ...)` in a suite never intercepts them, and the
 * package throws `ChatHostNotConfiguredError`. The supported seam is `configureChat({ db })`;
 * this helper is the ONE place suites do that, so no suite mocks an internal module path.
 *
 * Pass any structural double. The host requires `auth`, `rpc` and `from` to exist; the
 * helper fills only the ones the double leaves out (inert), never overriding the suite's own.
 * `ports` configures any other host port the suite observes (e.g. `notify`, to see the toast
 * the package raises through the HOST rather than through the app's own toast module).
 */
import { configureChat, _resetChatHostForTests, type ChatHost } from "@ai-matrx/chat/host";

export function installChatHostDb<T extends object>(db: T, ports: Partial<ChatHost> = {}): T {
  const d = db as Record<string, unknown>;
  if (d.auth === undefined) d.auth = {};
  if (typeof d.rpc !== "function") d.rpc = async () => ({ data: null, error: null });
  if (typeof d.from !== "function") d.from = () => ({});
  _resetChatHostForTests();
  configureChat({ ...ports, db: db as never } as ChatHost);
  return db;
}
