// verify-second-renderer.test.ts — zero-authorship verification (Lane G).
//
// R12 / CLAUDE.md law: "A shape has exactly ONE component" — a registered
// `__kind` renders via its kind component EVERYWHERE; a second renderer for
// the same shape is a defect even when it predates the compiled kind.
//
// `features/marketing/seo/topical-map/start/StartMapResult.tsx` (Lane E) still
// renders a `map_topic_proposal_v1` tree through its own local
// `ProposalTree` + `proposalRows.ts` adapter, built as an explicit INTERIM
// stand-in "until Lane G's kind component lands... then delete the adapter."
// Lane G's brief claims `MapTopicProposalView.tsx` as "THE ONE component for
// map_topic_proposal_v1" and the compiled kind is registered and dispatching
// (features/content-ir/kinds/map-topic-proposal.ts, block-dispatch.tsx,
// BlockComponentRegistry.tsx) — but StartMapResult.tsx was never repointed at
// it and `proposalRows.ts` was never deleted. That is a live second renderer
// for the same shape, not a hypothetical one.
//
// This test reads the real source files (no rendering needed — the defect is
// structural: which module a screen imports) so it fails loudly the moment
// StartMapResult.tsx is repointed at MapTopicProposalView and passes only
// once the second renderer is actually gone — never on a comment change.

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const START_MAP_RESULT = path.join(
  REPO_ROOT,
  "features/marketing/seo/topical-map/start/StartMapResult.tsx",
);
const PROPOSAL_ROWS = path.join(
  REPO_ROOT,
  "features/marketing/seo/topical-map/start/proposalRows.ts",
);

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

describe("R12 — map_topic_proposal_v1 has exactly ONE component", () => {
  it("Lane E's start screen renders the proposal through MapTopicProposalView, not a local adapter", () => {
    const source = readIfExists(START_MAP_RESULT);
    // If the file is gone entirely the law is moot for it; that is not this
    // defect. Only assert when the file exists.
    if (source === null) {
      expect(true).toBe(true);
      return;
    }
    const usesLocalProposalTree = /function ProposalTree\(/.test(source) ||
      /from ["']\.\/proposalRows["']/.test(source);
    const usesCanonicalComponent = /MapTopicProposalView/.test(source);

    expect({
      usesLocalProposalTree,
      usesCanonicalComponent,
    }).toEqual({
      usesLocalProposalTree: false,
      usesCanonicalComponent: true,
    });
  });

  it("the interim adapter proposalRows.ts is deleted once the kind component lands", () => {
    // The file's own header says: "When the kind component exists, replace
    // <ProposalTree> with it and delete the adapter." The kind component
    // exists (see kind-map-topic-proposal.test.ts's registration leg); this
    // fails until the adapter is actually removed.
    const stillExists = readIfExists(PROPOSAL_ROWS) !== null;
    expect(stillExists).toBe(false);
  });
});
