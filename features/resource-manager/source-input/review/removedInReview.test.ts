import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { removedInReview } from "./removedInReview";

const PDF = "11111111-1111-4111-8111-111111111111";
const NOTE = "22222222-2222-4222-8222-222222222222";
const PAGE = "33333333-3333-4333-8333-333333333333";

describe("Remove in the review removes exactly that Source", () => {
  const reviewed = createSourceSet([
    createSourceRef("file", PDF),
    createSourceRef("note", NOTE),
    createSourceRef("processed_document", PAGE),
  ]);

  it("the one the person removed — and only it — comes back as removed", () => {
    const answer = createSourceSet([
      createSourceRef("file", PDF, { include_segments: ["p3"] }),
      createSourceRef("processed_document", PAGE),
    ]);
    expect([...removedInReview(reviewed, answer)]).toEqual([`note:${NOTE}`]);
  });

  it("changing a Source's form or parts is not a removal", () => {
    const answer = createSourceSet(reviewed.sources.map((r) => createSourceRef(r.resource_type, r.resource_id, { representation: "raw" })));
    expect(removedInReview(reviewed, answer).size).toBe(0);
  });
});
