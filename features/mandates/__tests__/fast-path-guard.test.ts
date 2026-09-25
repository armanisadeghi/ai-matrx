/**
 * A hard-coded fast path is compliant ONLY when it is verified at runtime
 * against its Mandate, loudly. These pin the three verdicts through the real
 * capture store (the admin Error Inspector's one sink): remove the comparison
 * or the scream in `fast-path-guard.ts` and the mismatch cases go red.
 */

import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  resetFastPathVerdictsForTests,
  verifyFastPathAgainstMandate,
} from "../fast-path-guard";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

const KEY = MANDATE_KEYS.chat__cx_default;
const SEED = "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8";
const REBOUND = "11111111-2222-4333-8444-555555555555";

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("verifyFastPathAgainstMandate", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    resetFastPathVerdictsForTests();
    clearCapturedErrors();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("stays silent when the hard-coded id IS the Mandate's Holder", async () => {
    const verdict = await verifyFastPathAgainstMandate(
      { mandateKey: KEY, hardcodedAgentId: SEED, surface: "test/match" },
      async () => ({ agentId: SEED }),
    );
    await flush();
    expect(verdict.status).toBe("match");
    expect(getSnapshot().filter((e) => e.source === "mandate-fast-path")).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("screams red to admins when the Mandate was rebound away from the seed", async () => {
    const verdict = await verifyFastPathAgainstMandate(
      { mandateKey: KEY, hardcodedAgentId: SEED, surface: "test/mismatch" },
      async () => ({ agentId: REBOUND }),
    );
    await flush();
    expect(verdict).toEqual({ status: "mismatch", resolvedAgentId: REBOUND });
    const captured = getSnapshot().filter((e) => e.source === "mandate-fast-path");
    expect(captured).toHaveLength(1);
    expect(captured[0].tier).toBe("red");
    expect(captured[0].code).toBe("fast_path_mismatch");
    // The ids reach the admin as structured evidence, never inside the
    // sentence (no-uuid-in-sentences).
    expect(captured[0].raw).toMatchObject({
      hardcodedAgentId: SEED,
      verdict: { resolvedAgentId: REBOUND },
    });
    expect(captured[0].message).not.toContain(SEED);
    expect(captured[0].message).not.toContain(REBOUND);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[mandate-fast-path]"),
      expect.objectContaining({ hardcodedAgentId: SEED, resolvedAgentId: REBOUND }),
    );
  });

  it("screams when the Mandate cannot be resolved — the fast path ran unverified", async () => {
    const verdict = await verifyFastPathAgainstMandate(
      { mandateKey: KEY, hardcodedAgentId: SEED, surface: "test/unresolved" },
      async () => {
        throw new Error("door down");
      },
    );
    await flush();
    expect(verdict.status).toBe("unresolved");
    const captured = getSnapshot().filter((e) => e.source === "mandate-fast-path");
    expect(captured).toHaveLength(1);
    expect(captured[0].code).toBe("fast_path_unverified");
  });

  it("asks the Mandate once per fast path per page life", async () => {
    const resolve = jest.fn(async () => ({ agentId: SEED }));
    const check = { mandateKey: KEY, hardcodedAgentId: SEED, surface: "test/once" };
    await verifyFastPathAgainstMandate(check, resolve);
    await verifyFastPathAgainstMandate(check, resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
