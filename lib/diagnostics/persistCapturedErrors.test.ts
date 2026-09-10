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

import {
  clearCapturedErrors,
  captureError,
} from "@/lib/diagnostics/errorCaptureStore";
import { installErrorPersistence } from "@/lib/diagnostics/persistCapturedErrors";
import {
  EARLY_USER_OBSERVATION_MS,
  shouldPersistCapturedTier,
} from "@/lib/diagnostics/persistCapturedErrors";
import {
  recordUnavailable,
  resolveRecordUnavailableCapture,
} from "@/lib/records/recordUnavailable";

describe("captured error persistence settlement", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "production",
    });
    installErrorPersistence();
  });

  beforeEach(() => {
    clearCapturedErrors();
    rpc.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
    jest.useRealTimers();
  });

  it("persists ordinary red captures on the normal debounce", async () => {
    captureError({ source: "runtime-exception", message: "real failure" });

    await jest.advanceTimersByTimeAsync(1_500);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "log_client_error",
      expect.objectContaining({
        p_source: "runtime-exception",
        p_message: "real failure",
      }),
    );
  });

  // Break caught: dropping the per-session dedupe. Every new capture triggers
  // another flush while earlier entries are still in the store; each entry
  // must reach system_error exactly once.
  it("persists each captured entry once even as later captures trigger more flushes", async () => {
    captureError({ source: "runtime-exception", message: "first failure" });
    await jest.advanceTimersByTimeAsync(1_500);
    captureError({ source: "runtime-exception", message: "second failure" });
    await jest.advanceTimersByTimeAsync(1_500);

    expect(rpc.mock.calls.map(([, args]) => args.p_message)).toEqual([
      "first failure",
      "second failure",
    ]);
  });

  // Break caught: the production-only gate. A dev/local build must never write
  // into the production error queue.
  it("never persists from a non-production build", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "development",
    });
    try {
      captureError({ source: "runtime-exception", message: "local failure" });
      await jest.advanceTimersByTimeAsync(1_500);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", {
        configurable: true,
        value: "production",
      });
    }
  });

  // Break caught: persisting the failure of log_client_error itself, which
  // re-captures and loops forever. The control proves the filter is that one
  // relation, not a blanket drop of RPC failures.
  it("never persists its own log_client_error failure, while other RPC failures still land", async () => {
    captureError({
      source: "runtime-exception",
      relation: "log_client_error",
      operation: "rpc",
      status: 500,
      message: "log_client_error write refused",
    });
    captureError({
      source: "runtime-exception",
      relation: "mbr_for_user",
      operation: "rpc",
      status: 500,
      message: "mbr_for_user write refused",
    });

    await jest.advanceTimersByTimeAsync(1_500);

    expect(rpc.mock.calls.map(([, args]) => args.p_message)).toEqual([
      "mbr_for_user write refused",
    ]);
  });

  it("persists the captured document identity even if scripts change before flush", async () => {
    const script = document.createElement("script");
    script.src =
      "https://manage.aimatrx.com/_next/static/chunks/runtime.js?dpl=dpl_loaded_old";
    document.head.append(script);
    try {
      captureError({
        source: "runtime-exception",
        message: "provenance first failure",
      });
      script.src =
        "https://manage.aimatrx.com/_next/static/chunks/runtime.js?dpl=dpl_loaded_new";
      await jest.advanceTimersByTimeAsync(1_500);
      expect(rpc).toHaveBeenCalledWith(
        "log_client_error",
        expect.objectContaining({
          p_context: expect.objectContaining({
            browserProvenance: expect.objectContaining({
              pageSessionId: expect.any(String),
              pageStartedAt: expect.any(Number),
              deploymentIdsOnPage: ["dpl_loaded_old"],
            }),
          }),
        }),
      );
      const first = rpc.mock.calls[0][1].p_context.browserProvenance;
      rpc.mockClear();
      captureError({
        source: "console-error",
        message: "provenance second failure",
      });
      await jest.advanceTimersByTimeAsync(1_500);
      const second = rpc.mock.calls[0][1].p_context.browserProvenance;
      expect(second.pageSessionId).toBe(first.pageSessionId);
      expect(second.deploymentIdsOnPage).toEqual(["dpl_loaded_new"]);
    } finally {
      script.remove();
    }
  });

  it("keeps explicitly local recovery diagnostics out of system_error", async () => {
    captureError({
      source: "unsaved-work",
      message: "draft was preserved",
      durable: false,
    });

    await jest.advanceTimersByTimeAsync(1_500);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps rule-classified Supabase transport loss out for every account tier", async () => {
    captureError({
      source: "supabase-postgrest",
      relation: "mbr_for_user",
      operation: "rpc",
      name: "TypeError",
      status: 0,
      message: "TypeError: Load failed",
    });

    await jest.advanceTimersByTimeAsync(1_500);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps rule-classified Supabase request cancellation out of system_error", async () => {
    captureError({
      source: "supabase-postgrest",
      relation: "integration_connections",
      operation: "select",
      name: "AbortError",
      status: 0,
      message: "AbortError: signal is aborted without reason",
    });

    await jest.advanceTimersByTimeAsync(1_500);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps a denial local when AccessGate resolves during the grace window", async () => {
    const error = recordUnavailable({
      entity: "brand",
      reason: "unknown",
      recordId: "brand-1",
      token: "web_brand",
    });

    await jest.advanceTimersByTimeAsync(1_500);
    expect(rpc).not.toHaveBeenCalled();

    resolveRecordUnavailableCapture(error, "denied");
    await jest.advanceTimersByTimeAsync(8_500);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("persists an unresolved access question after the bounded grace window", async () => {
    recordUnavailable({
      entity: "brand",
      reason: "unknown",
      recordId: "brand-2",
      token: "web_brand",
    });

    await jest.advanceTimersByTimeAsync(10_000);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "log_client_error",
      expect.objectContaining({
        p_message: "Zero-row read for brand brand-2 (unknown)",
      }),
    );
  });
});

describe("early-user persistence policy", () => {
  const now = Date.parse("2026-08-19T12:00:00.000Z");

  it("persists every tier for guests", () => {
    expect(
      shouldPersistCapturedTier({
        tier: "yellow",
        isGuest: true,
        createdAt: null,
        now,
      }),
    ).toBe(true);
  });

  it("persists every tier during the first seven days", () => {
    expect(
      shouldPersistCapturedTier({
        tier: "orange",
        isGuest: false,
        createdAt: new Date(now - EARLY_USER_OBSERVATION_MS + 1).toISOString(),
        now,
      }),
    ).toBe(true);
  });

  // Breaks caught: treating an unknown account age, or a clock-skewed future
  // createdAt, as "early" — both would flood system_error with every tier.
  it.each([
    ["an unknown account age", null],
    ["a createdAt in the future", new Date(now + 60 * 60 * 1000).toISOString()],
  ])("keeps non-red tiers local for %s", (_label, createdAt) => {
    expect(
      shouldPersistCapturedTier({
        tier: "orange",
        isGuest: false,
        createdAt,
        now,
      }),
    ).toBe(false);
  });

  it("returns established accounts to red-only persistence", () => {
    const established = new Date(now - EARLY_USER_OBSERVATION_MS).toISOString();
    expect(
      shouldPersistCapturedTier({
        tier: "yellow",
        isGuest: false,
        createdAt: established,
        now,
      }),
    ).toBe(false);
    expect(
      shouldPersistCapturedTier({
        tier: "red",
        isGuest: false,
        createdAt: established,
        now,
      }),
    ).toBe(true);
  });
});
