import { attachRefsToCitation, attachSourceRefs } from "../grounding";
import type { SourceCitation } from "../types";

// verify-4 (2026-09-30): the agent titled a Wikipedia citation "Industrial
// applications" and a YouTube transcript "Enzyme Basics Transcript"; the
// Sources the person picked are "Enzyme - Wikipedia" and "Enzymes (Updated)".
const agentCitation: SourceCitation = {
  sourceId: "a3fe9643-d76b-4d85-9c4b-9b7f4ce18c6c",
  sourceKind: "chunk",
  title: "Industrial applications",
  locator: "Biofuel industry",
  excerpt: "Cellulases break down cellulose into sugars.",
};

describe("a citation names the Source's real name", () => {
  it("the Source's real name wins over the agent's made-up title", () => {
    const c = attachRefsToCitation(agentCitation, {
      documentId: "996957e2-e9b9-4708-9846-68678dc105e7",
      title: "Enzyme - Wikipedia",
    });
    expect(c.title).toBe("Enzyme - Wikipedia");
    // The agent's locator (where inside the Source) is kept.
    expect(c.locator).toBe("Biofuel industry");
  });

  it("every citation in an envelope is renamed", () => {
    const env = attachSourceRefs(
      { citations: [agentCitation, { ...agentCitation, title: "Enzyme Basics Transcript" }], confidence: "grounded" },
      { title: "Enzymes (Updated)" },
    );
    expect(env?.citations.map((c) => c.title)).toEqual(["Enzymes (Updated)", "Enzymes (Updated)"]);
  });

  it("the agent's title stays only when the surface does not know the name", () => {
    expect(attachRefsToCitation(agentCitation, {}).title).toBe("Industrial applications");
    expect(attachRefsToCitation(agentCitation, { title: null }).title).toBe("Industrial applications");
  });
});
