/**
 * FX3-W: two review walks must be told apart by title and by position.
 */
import { walkTitle, nextStackIndex } from "../walkTitle";

describe("walk window title", () => {
  it("names the role and the agent, so two walks of one pair differ", () => {
    const live = walkTitle({ unitKind: "agent_request", agentName: "Page Summary Analyst", roleLabel: "Live" });
    const cand = walkTitle({ unitKind: "agent_request", agentName: "Page Summary Analyst", roleLabel: "Candidate" });
    expect(live).toBe("Live · Page Summary Analyst");
    expect(cand).toBe("Candidate · Page Summary Analyst");
    expect(live).not.toBe(cand);
  });
  it("falls back to the agent name, then to the unit kind", () => {
    expect(walkTitle({ unitKind: "agent_request", agentName: "Notes Bot" })).toBe("Notes Bot");
    expect(walkTitle({ unitKind: "agent_request" })).toBe("Diagnose — agent request");
  });
  it("stays inside the 40 character budget", () => {
    const t = walkTitle({ unitKind: "agent_request", agentName: "A".repeat(90), roleLabel: "Candidate" });
    expect(t.length).toBeLessThanOrEqual(40);
  });
});

describe("walk cascade", () => {
  it("takes the lowest free slot, never one an open walk holds", () => {
    expect(nextStackIndex([])).toBe(0);
    expect(nextStackIndex([0])).toBe(1);
    // old rule (count of open windows) gave 2 here and collided with slot 1
    expect(nextStackIndex([1, 2])).toBe(0);
    expect(nextStackIndex([0, 2])).toBe(1);
  });
});
