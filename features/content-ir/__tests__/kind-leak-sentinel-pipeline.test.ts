/**
 * @jest-environment jsdom
 *
 * R3 (round 6) — THE SENTINEL'S CLIENT HALF, end to end, nothing mocked between
 * the DOM and the RPC: a kind drawn as raw text → the sentinel → the REAL
 * `captureError` → the Error Inspector store → `installErrorPersistence`'s flush
 * → `log_client_error`. Only the edges are stubbed (Redux identity: an
 * ESTABLISHED account, like admin@admin.com; and the Supabase client).
 *
 * Why: zero `content-ir` sentinel rows were ever recorded in ops.system_error.
 * An established account persists only RED captures, so a sentinel report that
 * classified below red would never leave the browser.
 */

const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
const originalNodeEnv = process.env.NODE_ENV;

jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => ({ getState: () => ({}) }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectIsAuthenticated: () => true,
  selectIsAnonymous: () => false,
  selectUserCreatedAt: () => "2020-01-01T00:00:00.000Z",
}));
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc },
}));

import { clearCapturedErrors, getSnapshot } from "@/lib/diagnostics/errorCaptureStore";
import { installErrorPersistence } from "@/lib/diagnostics/persistCapturedErrors";
import { installKindLeakSentinel, resetKindLeakSentinelReports } from "../surfaces/kind-leak-sentinel";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[]}';

describe("a sentinel report reaches the server error sink (R3)", () => {
  let dispose: () => void = () => undefined;
  beforeAll(() => {
    jest.useFakeTimers();
    Object.defineProperty(process.env, "NODE_ENV", { configurable: true, value: "production" });
    installErrorPersistence();
  });
  beforeEach(() => {
    clearCapturedErrors();
    rpc.mockClear();
    resetKindLeakSentinelReports();
    document.body.innerHTML = "";
  });
  afterEach(() => dispose());
  afterAll(() => {
    Object.defineProperty(process.env, "NODE_ENV", { configurable: true, value: originalNodeEnv });
    jest.useRealTimers();
  });

  it("a raw kind on screen is captured red and sent to log_client_error", async () => {
    dispose = installKindLeakSentinel({ root: document.body, debounceMs: 50, logToConsole: false });
    const p = document.createElement("p");
    p.textContent = `Here are your cards: ${KIND}`;
    document.body.appendChild(p);

    await jest.advanceTimersByTimeAsync(200);
    const rows = getSnapshot().filter((row) => row.source === "content-ir");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tier).toBe("red");
    expect(rows[0]!.durable).not.toBe(false);

    await jest.advanceTimersByTimeAsync(2_000);
    const sent = rpc.mock.calls.filter(
      ([fn, args]) => fn === "log_client_error" && args.p_source === "content-ir",
    );
    expect(sent).toHaveLength(1);
    expect(String(sent[0]![1].p_message)).toContain("flashcard_set");
  });
});
