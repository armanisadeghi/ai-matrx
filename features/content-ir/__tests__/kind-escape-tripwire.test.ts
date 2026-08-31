import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import { findEscapedKindMarkers } from "../react/kind-problems";

function envelopeFor(
  kind: string,
  kindState: CanonicalBlockIR["root"]["kindState"] = "raw",
): CanonicalBlockIR {
  return {
    v: 1,
    engine: "fe-kind-parser",
    fingerprint: "tripwire-test",
    root: {
      role: "structured",
      path: [],
      kind,
      kindState,
      discriminator: { format: "json", key: "__kind" },
      status: "complete",
      value: {},
      residue: null,
    },
    nodeIndex: {},
  };
}

describe("registered-kind escape tripwire", () => {
  const mandate = {
    __kind: "agent_mandate_specification",
    name: "Research mandate",
  };

  it("does not misreport a schema-degraded region that promotion already claimed", () => {
    expect(
      findEscapedKindMarkers(
        mandate,
        envelopeFor("agent_mandate_specification", "raw"),
      ),
    ).toEqual([]);
  });

  it("still reports the same registered payload when no promotion envelope exists", () => {
    expect(findEscapedKindMarkers(mandate, null)).toEqual([
      { slug: "agent_mandate_specification", path: "" },
    ]);
  });

  it("reports only an unclaimed nested marker", () => {
    const value = {
      __kind: "agent_mandate_specification",
      nested: { __kind: "unclaimed_child" },
    };
    expect(
      findEscapedKindMarkers(
        value,
        envelopeFor("agent_mandate_specification", "resolved"),
      ),
    ).toEqual([{ slug: "unclaimed_child", path: "nested" }]);
  });
});
