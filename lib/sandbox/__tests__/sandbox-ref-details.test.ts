/** @jest-environment node */
/**
 * `resolveSandboxRefDetails` — expected stale bindings are not errors.
 *
 * A deleted/expired sandbox legitimately outlives its conversation binding
 * (HTTP 404): that is a lifecycle state the pre-send gate recovers from, so it
 * warns and stays out of the system_error queue. Any other failure is a real
 * defect and stays on the error channel. `fetch` is the only double, answering
 * with real `Response` objects (node environment). Moved out of
 * sandbox-gate.test.ts, whose real app store needs jsdom.
 */

import { resolveSandboxRefDetails } from "../active-binding";

describe("resolveSandboxRefDetails — expected stale bindings are not errors", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const respondWith = (status: number) =>
    jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status }));

  it("warns and returns null when the bound sandbox row is gone", async () => {
    global.fetch = respondWith(404);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(resolveSandboxRefDetails("gone-box-404")).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stale binding"));
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps unexpected sandbox-detail failures on the error channel", async () => {
    global.fetch = respondWith(500);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(resolveSandboxRefDetails("broken-box-500")).resolves.toBeNull();

    expect(error).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"));
    expect(warn).not.toHaveBeenCalled();
  });
});
