/**
 * FORCING GUARD — the hosted destination may never lie.
 *
 * The bridge `capabilities` verdict for provider=claude_code ×
 * origin=matrx_sandbox used to say "available" while nothing could launch, and
 * the frontend's second, inert capability reader let a button exist next to
 * that claim (it is deleted — see `one-capability-reader.test.ts`). This suite pins the only honest rule:
 *
 *   "Claude Code (hosted)" is selectable ONLY when the report says
 *   `available: true` AND the `start` AND `stream` operations are both
 *   supported — and every refusal renders the SERVER's own sentence, verbatim.
 *
 * Every expected sentence below is typed by hand. Nothing is produced by
 * importing the code under test.
 */

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

function verdicts(
  entries: Partial<Record<BridgeOperation, BridgeOperationVerdict>>,
): CodingBridgeCapability["operations"] {
  return { ...INITIAL_BRIDGE_CAPABILITY.operations, ...entries };
}

function ok(operation: BridgeOperation): BridgeOperationVerdict {
  return { operation, supported: true, reason: null };
}

function refused(
  operation: BridgeOperation,
  reason: string,
): BridgeOperationVerdict {
  return { operation, supported: false, reason };
}

const LAUNCHABLE: CodingBridgeCapability = {
  state: "ready",
  available: true,
  reason: null,
  runtime: "matrx_sandbox",
  operations: verdicts({ start: ok("start"), stream: ok("stream") }),
  organizationRequired: false,
};

describe("the hosted destination exists and is bridge-gated", () => {
  it("offers Claude Code (hosted) directly after Claude Code on my Mac", () => {
    const ids = WORK_DESTINATIONS.map((destination) => destination.id);
    expect(ids).toContain("claude-code-hosted");
    expect(ids[ids.indexOf("claude-code") + 1]).toBe("claude-code-hosted");
  });

  it("names the Matrx Sandbox in plain words and invents no product name", () => {
    const hosted = WORK_DESTINATIONS.find((d) => d.id === "claude-code-hosted");
    expect(hosted?.label).toBe("Claude Code (hosted)");
    expect(hosted?.summary).toContain("Matrx Sandbox");
  });
});

describe("destinationAvailability('claude-code-hosted')", () => {
  it("is selectable when the report is available and start + stream are supported", () => {
    expect(destinationAvailability("claude-code-hosted", LAUNCHABLE)).toEqual({
      selectable: true,
      reason: null,
    });
  });

  it("says it is still asking while the verdict has not arrived", () => {
    expect(
      destinationAvailability(
        "claude-code-hosted",
        INITIAL_BRIDGE_CAPABILITY,
      ),
    ).toEqual({
      selectable: false,
      reason: "Checking whether a hosted sandbox can be started for you…",
    });
  });

  it("renders the report's own reason verbatim when the report is unavailable", () => {
    const availability = destinationAvailability("claude-code-hosted", {
      ...LAUNCHABLE,
      available: false,
      reason: "Your plan does not include hosted sandboxes yet.",
    });
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBe(
      "Your plan does not include hosted sandboxes yet.",
    );
  });

  // The real readiness sentence the server sends when the caller's plan has no
  // sandbox. Typed by hand, rendered verbatim: paraphrasing it would drop the
  // two ways out (Matrx Local, or a plan with a sandbox).
  it("renders the readiness refusal sentence verbatim, with both ways out", () => {
    const sentence =
      "Your plan does not include a Matrx Sandbox, so there is nowhere for a hosted Claude Code session to run. Continue the session on your own machine with Matrx Local, or upgrade the plan to get a sandbox.";
    const availability = destinationAvailability("claude-code-hosted", {
      ...LAUNCHABLE,
      available: false,
      reason: sentence,
      operations: verdicts({
        start: refused("start", sentence),
        stream: refused("stream", sentence),
      }),
    });
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBe(sentence);
  });

  // THE SHAPE THAT WOULD RE-SHIP A LYING BUTTON: the report claims it is
  // available while the operation that actually launches is refused.
  it("refuses an available report whose start operation is not supported", () => {
    const availability = destinationAvailability("claude-code-hosted", {
      ...LAUNCHABLE,
      available: true,
      reason: null,
      operations: verdicts({
        start: refused("start", "No sandbox image has been released yet."),
        stream: ok("stream"),
      }),
    });
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBe(
      "No sandbox image has been released yet.",
    );
  });

  it("refuses an available report whose stream operation is not supported", () => {
    const availability = destinationAvailability("claude-code-hosted", {
      ...LAUNCHABLE,
      operations: verdicts({
        start: ok("start"),
        stream: refused("stream", "Streaming is off for your organization."),
      }),
    });
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBe(
      "Streaming is off for your organization.",
    );
  });

  it("refuses a report that graded no start operation at all", () => {
    const availability = destinationAvailability("claude-code-hosted", {
      ...LAUNCHABLE,
      operations: verdicts({ stream: ok("stream") }),
    });
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBeTruthy();
  });

  it("renders the error sentence when the capability read itself failed", () => {
    const availability = destinationAvailability("claude-code-hosted", {
      ...INITIAL_BRIDGE_CAPABILITY,
      state: "error",
      reason: "AI Matrx refused the request: unknown_action",
    });
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toBe(
      "AI Matrx refused the request: unknown_action",
    );
  });

  it("never leaves the hosted destination unselectable without a sentence", () => {
    const shapes: CodingBridgeCapability[] = [
      INITIAL_BRIDGE_CAPABILITY,
      { ...INITIAL_BRIDGE_CAPABILITY, state: "error" },
      { ...LAUNCHABLE, available: false, reason: null },
      {
        ...LAUNCHABLE,
        operations: verdicts({
          start: { operation: "start", supported: false, reason: null },
        }),
      },
    ];
    for (const capability of shapes) {
      const availability = destinationAvailability(
        "claude-code-hosted",
        capability,
      );
      expect(availability.selectable).toBe(false);
      expect(availability.reason).toBeTruthy();
    }
  });
});
