/**
 * The diagnostics default writes through the EXISTING `log_client_error` RPC
 * (no new table), with the same production-only / dedupe / throttle /
 * signed-in rules as lib/diagnostics/persistCapturedErrors.ts, and refuses an
 * app name the RPC would refuse — loudly, once.
 */

import {
  CHAT_SOURCE_FEATURE,
  DIAGNOSTICS_MAX_PER_FLUSH,
  createLogClientErrorDiagnostics,
  resolveChatHost,
} from "../index";
import { _resetAnnouncements } from "../errors";
import { createFakeDb } from "../../testing/fake-db";

let error: jest.SpyInstance;
let info: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  _resetAnnouncements();
  error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  info = jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  error.mockRestore();
  info.mockRestore();
});

async function flush(): Promise<void> {
  await jest.runOnlyPendingTimersAsync();
}

describe("diagnostics default writes log_client_error", () => {
  it("a valid sourceApp, signed in, in production: one log_client_error row per distinct failure", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1" });
    const diagnostics = createLogClientErrorDiagnostics(fake.db, {
      sourceApp: "matrx-extend",
      persist: true,
    });
    const failure = new Error("stream died");
    diagnostics.capture(failure, {
      area: "stream",
      code: "heartbeat-lost",
      detail: { turn: 3 },
    });
    diagnostics.capture(failure, { area: "stream", code: "heartbeat-lost" });
    await flush();

    expect(fake.rpcCalls).toHaveLength(1);
    const [call] = fake.rpcCalls;
    expect(call.fn).toBe("log_client_error");
    expect(call.args).toMatchObject({
      p_source_app: "matrx-extend",
      p_source_feature: CHAT_SOURCE_FEATURE,
      p_source: "chat-stream",
      p_message: "stream died",
      p_code: "heartbeat-lost",
      p_context: {
        area: "stream",
        code: "heartbeat-lost",
        detail: { turn: 3 },
      },
    });
    expect(typeof call.args.p_stack).toBe("string");
    // Always on the console as well.
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("stream/heartbeat-lost: stream died"),
      { turn: 3 },
    );
  });

  it("the resolved host's default diagnostics use the host's sourceApp", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1" });
    const host = resolveChatHost({ db: fake.db, sourceApp: "matrx-local" });
    expect(host.sourceApp).toBe("matrx-local");
    // NODE_ENV is "test" here, so the default does not persist: console only.
    host.diagnostics.capture(new Error("x"), { area: "a", code: "b" });
    await flush();
    expect(fake.rpcCalls).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("a/b: x"), "");
  });

  it("a flush is capped; the rest go in the next flush", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1" });
    const diagnostics = createLogClientErrorDiagnostics(fake.db, {
      sourceApp: "matrx-frontend",
      persist: true,
    });
    for (let i = 0; i < DIAGNOSTICS_MAX_PER_FLUSH + 5; i++) {
      diagnostics.capture(new Error(`failure ${i}`), {
        area: "inbox",
        code: "c",
      });
    }
    await flush();
    expect(fake.rpcCalls).toHaveLength(DIAGNOSTICS_MAX_PER_FLUSH);
    await flush();
    expect(fake.rpcCalls).toHaveLength(DIAGNOSTICS_MAX_PER_FLUSH + 5);
  });

  it("an invalid sourceApp never reaches the RPC and fails loudly to the console once", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1" });
    const diagnostics = createLogClientErrorDiagnostics(fake.db, {
      sourceApp: "my-vite-app",
      persist: true,
    });
    diagnostics.capture(new Error("one"), { area: "a", code: "b" });
    diagnostics.capture(new Error("two"), { area: "a", code: "b" });
    await flush();
    expect(fake.rpcCalls).toHaveLength(0);
    const refusals = error.mock.calls.filter(([line]) =>
      String(line).includes(
        'sourceApp "my-vite-app" is not one the errors system accepts',
      ),
    );
    expect(refusals).toHaveLength(1);
  });

  it("a missing sourceApp stays on the console and names the remedy once", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1" });
    const diagnostics = createLogClientErrorDiagnostics(fake.db, {
      sourceApp: undefined,
      persist: true,
    });
    diagnostics.capture(new Error("one"), { area: "a", code: "b" });
    await flush();
    expect(fake.rpcCalls).toHaveLength(0);
    expect(
      error.mock.calls.filter(([line]) =>
        String(line).includes("Pass sourceApp"),
      ),
    ).toHaveLength(1);
  });

  it("signed out: console only, announced once, nothing sent", async () => {
    const fake = createFakeDb();
    fake.setSession(null);
    const diagnostics = createLogClientErrorDiagnostics(fake.db, {
      sourceApp: "matrx-frontend",
      persist: true,
    });
    diagnostics.capture(new Error("one"), { area: "a", code: "b" });
    await flush();
    diagnostics.capture(new Error("two"), { area: "a", code: "b" });
    await flush();
    expect(fake.rpcCalls).toHaveLength(0);
    expect(
      info.mock.calls.filter(([line]) =>
        String(line).includes("while nobody is signed in"),
      ),
    ).toHaveLength(1);
  });

  it("an RPC refusal stays on the console and is never captured back (no loop)", async () => {
    const fake = createFakeDb();
    fake.setSession({ id: "user-1" });
    fake.rpcError = { message: "refused" };
    const diagnostics = createLogClientErrorDiagnostics(fake.db, {
      sourceApp: "matrx-frontend",
      persist: true,
    });
    diagnostics.capture(new Error("one"), { area: "a", code: "b" });
    await flush();
    await flush();
    expect(fake.rpcCalls).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("log_client_error refused a chat diagnostic"),
      { message: "refused" },
    );
  });
});
