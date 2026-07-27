// features/agents/search/score.parity.test.ts
//
// The TS scorer and its SQL mirror (public.agx_search_score) must agree.
// This locks the TS side to the shared fixture; the SQL side is checked
// against the SAME fixture by scripts/check-search-score-parity.sql.
//
// Why this guard exists: /agents/all shipped a server-side search that was a
// flat `ILIKE OR` with NO ranking, so a description match tied with a name
// match and searching "image" buried every image agent. The tiers below are
// the contract that prevents a repeat.

import fixture from "./__fixtures__/search-score-parity.json";
import { computeAgentSearchScore, type AgentSearchable } from "./score";

interface ParityCase {
  why: string;
  query: string;
  agent: AgentSearchable;
  score: number;
}

describe("computeAgentSearchScore — SQL parity fixture", () => {
  for (const c of fixture.cases as ParityCase[]) {
    it(`${c.why} → ${c.score}`, () => {
      expect(computeAgentSearchScore(c.agent, c.query)).toBe(c.score);
    });
  }

  it("a name match always outranks a description-only match", () => {
    const named: AgentSearchable = { id: "a", name: "Basic Image Generator" };
    const described: AgentSearchable = {
      id: "b",
      name: "App Description Generator",
      description: "makes an image",
    };
    expect(computeAgentSearchScore(named, "image")).toBeGreaterThan(
      computeAgentSearchScore(described, "image"),
    );
  });
});
