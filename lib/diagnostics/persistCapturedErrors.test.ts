const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
const originalNodeEnv = process.env.NODE_ENV;

jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => ({ getState: () => ({}) }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectIsAuthenticated: () => true,
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
      expect.objectContaining({ p_message: "real failure" }),
    );
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
