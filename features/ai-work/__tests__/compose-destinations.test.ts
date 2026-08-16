import {
  WORK_DESTINATIONS,
  destinationAvailability,
} from "@/features/ai-work/compose/destinations";
import {
  INITIAL_CAPABILITY,
  type ManagedCapability,
} from "@/features/ai-work/lib/managedClaudeCapability";

const READY_AVAILABLE: ManagedCapability = {
  state: "ready",
  available: true,
  nativeResume: true,
  nativeFork: true,
  reason: null,
};

const READY_UNAVAILABLE: ManagedCapability = {
  state: "ready",
  available: false,
  nativeResume: false,
  nativeFork: false,
  reason: "The hosted image is not released.",
};

describe("destinationAvailability", () => {
  it("makes AI Matrx the one selectable destination", () => {
    const selectable = WORK_DESTINATIONS.filter(
      (destination) =>
        destinationAvailability(destination.id, READY_AVAILABLE).selectable,
    );
    expect(selectable.map((d) => d.id)).toEqual(["ai-matrx"]);
  });

  it("never leaves an unavailable destination without a reason", () => {
    for (const capability of [
      INITIAL_CAPABILITY,
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

  it("reports the live backend's own reason when Claude is unavailable", () => {
    expect(destinationAvailability("claude-code", READY_UNAVAILABLE)).toEqual({
      selectable: false,
      reason: "The hosted image is not released.",
    });
  });

  it("stays unselectable when Claude reports available but the UI is not certified", () => {
    const availability = destinationAvailability("claude-code", READY_AVAILABLE);
    expect(availability.selectable).toBe(false);
    expect(availability.reason).toContain("not certified yet");
  });
});
