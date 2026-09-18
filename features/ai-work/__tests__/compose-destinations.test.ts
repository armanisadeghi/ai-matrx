import {
  WORK_DESTINATIONS,
  destinationAvailability,
} from "@/features/ai-work/compose/destinations";
import {
  INITIAL_BRIDGE_CAPABILITY,
  type BridgeOperation,
  type BridgeOperationVerdict,
  type CodingBridgeCapability,
} from "@/features/ai-work/lib/codingBridgeCapability";
import type { LocalRuntimeCapability } from "@/features/ai-work/lib/matrxLocalRuntime";

function localCapability(
  overrides: Partial<LocalRuntimeCapability>,
): LocalRuntimeCapability {
  return {
    state: "ready",
    available: true,
    reasons: [],
    claudeCli: "/opt/homebrew/bin/claude",
    claudeAccountLabel: null,
    workspaceRoots: [],
    approvedFolders: [],
    activeRuns: 0,
    ...overrides,
  };
}

function supported(operation: BridgeOperation): BridgeOperationVerdict {
  return { operation, supported: true, reason: null };
}

/** The bridge verdict that CAN launch a hosted sandbox run. */
const READY_AVAILABLE: CodingBridgeCapability = {
  state: "ready",
  available: true,
  reason: null,
  runtime: "matrx_sandbox",
  operations: {
    ...INITIAL_BRIDGE_CAPABILITY.operations,
    start: supported("start"),
    stream: supported("stream"),
  },
  organizationRequired: false,
};

/** The bridge verdict that cannot, with the server's own sentence. */
const READY_UNAVAILABLE: CodingBridgeCapability = {
  state: "ready",
  available: false,
  reason: "The hosted image is not released.",
  runtime: "matrx_sandbox",
  operations: INITIAL_BRIDGE_CAPABILITY.operations,
  organizationRequired: false,
};

describe("destinationAvailability", () => {
  it("selects only AI Matrx when no coding runtime can run", () => {
    const selectable = WORK_DESTINATIONS.filter(
      (destination) =>
        destinationAvailability(destination.id, READY_UNAVAILABLE).selectable,
    );
    expect(selectable.map((d) => d.id)).toEqual(["ai-matrx"]);
  });

  // The hosted destination's verdict is the bridge's, and nothing else — its
  // full rule set lives in `hosted-destination-verdict.test.ts`.
  it("adds the hosted destination once the bridge verdict can launch it", () => {
    const selectable = WORK_DESTINATIONS.filter(
      (destination) =>
        destinationAvailability(destination.id, READY_AVAILABLE).selectable,
    );
    expect(selectable.map((d) => d.id)).toEqual([
      "ai-matrx",
      "claude-code-hosted",
    ]);
  });

  it("never leaves an unavailable destination without a reason", () => {
    for (const capability of [
      INITIAL_BRIDGE_CAPABILITY,
      READY_AVAILABLE,
      READY_UNAVAILABLE,
    ]) {
      for (const destination of WORK_DESTINATIONS) {
        const availability = destinationAvailability(
          destination.id,
          capability,
        );
        if (!availability.selectable) {
          expect(availability.reason).toBeTruthy();
        }
      }
    }
  });

  // "Claude Code on my Mac" reads the user's OWN Matrx Local engine and
  // NOTHING else — the bridge verdict passed alongside it is the hosted
  // sandbox's, and must never leak into this branch. These assert that.
  it("says it is still asking while the local engine has not answered", () => {
    expect(destinationAvailability("claude-code", READY_UNAVAILABLE)).toEqual({
      selectable: false,
      reason: "Checking your Matrx Local app…",
    });
  });

  it("reports the local engine's own reason when it is unreachable", () => {
    const availability = destinationAvailability(
      "claude-code",
      READY_AVAILABLE,
      localCapability({
        state: "unreachable",
        available: false,
        reasons: ["Matrx Local did not answer."],
      }),
    );
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBe("Matrx Local did not answer.");
  });

  it("refuses a ready engine with no approved folder, and says which app approves one", () => {
    const availability = destinationAvailability(
      "claude-code",
      READY_AVAILABLE,
      localCapability({}),
    );
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toContain("Matrx Local");
  });

  it("is selectable once the local engine is ready with an approved folder", () => {
    expect(
      destinationAvailability(
        "claude-code",
        READY_UNAVAILABLE,
        localCapability({
          approvedFolders: ["/Users/me/code/matrx-frontend"],
        }),
      ),
    ).toEqual({ selectable: true, reason: null });
  });
});
