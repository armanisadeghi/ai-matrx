/**
 * THE SHARED COLUMN'S MARKER IS BECOMING PROVIDER-NEUTRAL, AND THIS READER IS
 * READY FOR BOTH SPELLINGS BEFORE THE SERVER MOVES.
 *
 * THE DEFECT THIS ANSWERS (VERIFY-U-P2-R4, V13-6).
 * `users.integration_connections.capability_health` defaults to
 * `{"__kind":"google_connection_capability_health"}` on a table that already
 * holds Google, GitHub and Bing rows, so a non-Google row declares itself a
 * Google kind — and this reader refused any value whose marker was not that
 * exact literal. The fix belongs with the column, and lane B-17 is renaming the
 * server's kind to `connection_capability_health` while keeping the schema
 * declaring it.
 *
 * CONSUMER ACTION FOR B-17: none. Both spellings are read here as of this
 * commit, either one is carried through on the parsed value as it was found, and
 * a value with no recognised marker still reads as "nothing recorded" rather
 * than being guessed at.
 */

import {
  CAPABILITY_HEALTH_KINDS,
  CONNECTION_CAPABILITY_HEALTH_KIND,
  GOOGLE_CAPABILITY_HEALTH_KIND,
  googleActivityByProduct,
  isCapabilityHealthKind,
  parseGoogleCapabilityHealth,
} from "../google-capability-health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const CAPABILITY = {
  docs: { last_success: { at: "2026-09-17T09:00:00Z", action: "docs.read" } },
};

describe("the capability-health marker", () => {
  it("declares exactly the two spellings in play", () => {
    expect([...CAPABILITY_HEALTH_KINDS].sort()).toEqual(
      ["connection_capability_health", "google_connection_capability_health"].sort(),
    );
    expect(isCapabilityHealthKind(GOOGLE_CAPABILITY_HEALTH_KIND)).toBe(true);
    expect(isCapabilityHealthKind(CONNECTION_CAPABILITY_HEALTH_KIND)).toBe(true);
    expect(isCapabilityHealthKind("something_else")).toBe(false);
    expect(isCapabilityHealthKind(null)).toBe(false);
  });

  it.each(CAPABILITY_HEALTH_KINDS)("reads a column marked %s", (kind) => {
    const read = parseGoogleCapabilityHealth({ __kind: kind, ...CAPABILITY });
    expect(read.recognized).toBe(true);
    // Carried as READ — never rewritten to the spelling this build prefers.
    expect(read.kind).toBe(kind);
    expect(Object.keys(read.capabilities)).toEqual(["docs"]);
    expect(
      googleActivityByProduct(GOOGLE_CONNECTOR_PROVIDER, read).workspace_files
        ?.lastSuccessAt,
    ).toBe("2026-09-17T09:00:00Z");
  });

  it("still refuses a value whose marker it does not know", () => {
    for (const raw of [
      null,
      7,
      {},
      { __kind: "github_connection_capability_health", docs: CAPABILITY.docs },
    ]) {
      const read = parseGoogleCapabilityHealth(raw);
      expect(read.recognized).toBe(false);
      expect(read.capabilities).toEqual({});
    }
  });

  /**
   * 🚨 V17-8 — THE MARKER "AS READ" WAS A CLAIM THIS FILE INVENTED. On any value
   * it did not recognise, the reader returned a shared `EMPTY` constant whose
   * `kind` was the LEGACY GOOGLE spelling — so a probe with
   * `__kind: "something_else"` came back `recognized: false, kind:
   * "google_connection_capability_health"`, reporting a marker the data never
   * had, in the one file whose stated law is that the marker read is the marker
   * carried. Harmless today (no reader shows it) and exactly the kind of quiet
   * false claim the next reader would build on.
   *
   * RED before the fix: both assertions below returned the legacy spelling.
   */
  it("carries the marker it actually SAW on a value it does not recognise", () => {
    const foreign = parseGoogleCapabilityHealth({
      __kind: "github_connection_capability_health",
      docs: CAPABILITY.docs,
    });
    expect(foreign.recognized).toBe(false);
    expect(foreign.kind).toBe("github_connection_capability_health");
    expect(foreign.kind).not.toBe(GOOGLE_CAPABILITY_HEALTH_KIND);
  });

  it("claims NO marker when the value carried none", () => {
    for (const raw of [null, 7, {}, { __kind: 3 }, "text"]) {
      const read = parseGoogleCapabilityHealth(raw);
      expect(read.recognized).toBe(false);
      // Null is the honest answer: there was nothing to carry.
      expect(read.kind).toBeNull();
    }
  });

  it("never treats the marker as a capability, under either spelling", () => {
    for (const kind of CAPABILITY_HEALTH_KINDS) {
      const read = parseGoogleCapabilityHealth({ __kind: kind, ...CAPABILITY });
      expect(Object.keys(read.capabilities)).not.toContain("__kind");
    }
  });
});
