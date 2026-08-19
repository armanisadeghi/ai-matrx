import {
  WORK_DESTINATIONS,
  destinationAvailability,
} from "@/features/ai-work/compose/destinations";
import {
  INITIAL_CAPABILITY,
  type ManagedCapability,
} from "@/features/ai-work/lib/managedClaudeCapability";
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

  // Claude Code's runnability moved to the user's OWN Matrx Local engine on
  // 2026-08-17; the hosted managed-sandbox capability is context, never a
  // launch path from the composer. These assert the live contract.
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
