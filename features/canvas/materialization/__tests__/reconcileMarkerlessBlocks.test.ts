/**
 * The reload safety net acts on every record the end-of-stream commit would
 * materialize — decided by the same detector (planMaterialization), never a
 * marker-string list. A bare `├──` tree and a bare GFM table carry no fence,
 * tag or JSON key; the old pre-filter skipped both, so a tab closed before the
 * commit lost them for good (conversation a0355e5d, 2026-10-02).
 */
const materializeBlocks = jest.fn();
jest.mock("../materializeBlocks", () => ({ materializeBlocks }));

import { reconcileSourceBlocks } from "../reconcileArtifacts";
import { planMaterialization } from "../planMaterialization";

const BARE_TREE =
  "Here is the layout:\n\nproject/\n├── src/\n│   ├── index.ts\n│   └── util.ts\n├── package.json\n└── README.md\n\nDone.";
const BARE_TABLE =
  "Compare:\n\n| Name | Age |\n|---|---|\n| Ada | 36 |\n| Alan | 41 |\n\nThat is all.";
const PLAIN = "Nothing to keep here, just a sentence.";

const source = (id: string) => ({
  system: "cx_message" as const,
  id,
  conversationId: "a0355e5d-0000-4000-8000-000000000000",
});

describe("reconcileSourceBlocks — marker-less blocks", () => {
  beforeEach(() => {
    materializeBlocks.mockReset();
    materializeBlocks.mockResolvedValue({
      materializedCount: 1,
      rewrittenContent: [],
      errors: [],
    });
  });

  it.each([
    ["a bare box-drawing tree", BARE_TREE, "tree"],
    ["a bare markdown table", BARE_TABLE, "table"],
  ])("materializes %s", async (_label, text, canvasType) => {
    const content = [{ type: "text", text }];
    // The commit's own detector sees it — the precondition of the guard.
    expect(
      planMaterialization(content as never).artifacts.map((a) => a.canvasType),
    ).toEqual([canvasType]);

    await reconcileSourceBlocks([{ source: source("m1"), content }]);

    expect(materializeBlocks).toHaveBeenCalledTimes(1);
    expect(materializeBlocks.mock.calls[0][0].content).toEqual(content);
  });

  it("skips a record the detector finds nothing in", async () => {
    await reconcileSourceBlocks([
      { source: source("m2"), content: [{ type: "text", text: PLAIN }] },
    ]);
    expect(materializeBlocks).not.toHaveBeenCalled();
  });
});
