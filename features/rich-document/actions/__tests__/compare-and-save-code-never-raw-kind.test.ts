/**
 * KIND_NEVER_RAW round 4 — S-compare and S-save.
 *
 * "Compare with clipboard / base" diffed the raw `{"__kind":…}` answer against
 * a readable clipboard: the person saw a wall of JSON in the diff. The diff now
 * reads the destination text (`contentForDestination`).
 *
 * "Save code to Scratch / Save to Code" take the first fenced block as CODE. A
 * ```json fence holding a kind is not code the person saw (it rendered as a
 * flashcard set), so it is skipped: no code snippet is offered for it and Save
 * to Code opens with the readable markdown instead.
 */
import "../handlers";
import { getAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { extractFirstCodeBlock } from "../utils";
import { chatContext } from "../../test-utils/chatContext";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};
const KIND_FENCE = "Your cards:\n\n```json\n" + JSON.stringify(SET) + "\n```\n";

function overlayData(dispatch: jest.Mock, overlayId: string) {
  return dispatch.mock.calls.map(([a]) => a?.payload).find((p) => p?.overlayId === overlayId)?.data;
}

describe("compare diffs the readable text", () => {
  it("Compare with clipboard: the current side is the kind's markdown", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: async () => "Cell biology notes" },
      configurable: true,
    });
    const dispatch = jest.fn();
    const ctx = { ...chatContext("assistant"), content: KIND_FENCE, dispatch };
    await getAction("compare-with-clipboard")!.run(ctx as never);
    const data = overlayData(dispatch, "diffViewerWindow");
    expect(data.original).not.toContain("__kind");
    expect(data.original).toContain("Mitochondria");
  });

  it("Set as compare base pins the readable text", () => {
    const dispatch = jest.fn();
    const ctx = { ...chatContext("assistant"), content: KIND_FENCE, dispatch };
    getAction("set-compare-base")!.run(ctx as never);
    const action = dispatch.mock.calls[0]![0];
    expect(action.payload.content).not.toContain("__kind");
  });
});

describe("save code skips a kind fence", () => {
  it("extractFirstCodeBlock reports no code for a kind-only fence", () => {
    const r = extractFirstCodeBlock(KIND_FENCE);
    expect(r.found).toBe(false);
  });

  it("extractFirstCodeBlock still finds real code after a kind fence", () => {
    const r = extractFirstCodeBlock(KIND_FENCE + "\n```ts\nconst a = 1;\n```\n");
    expect(r.found).toBe(true);
    expect(r.code).toContain("const a = 1;");
    expect(r.language).toBe("ts");
  });

  it("Save code to Scratch is not offered for a kind-only answer", () => {
    const ctx = { ...chatContext("assistant"), content: KIND_FENCE };
    expect(getAction("save-code-to-scratch")!.visible!(ctx as never)).toBe(false);
  });

  it("Save to Code opens with the readable markdown, never the kind JSON", () => {
    const dispatch = jest.fn();
    const ctx = { ...chatContext("assistant"), content: KIND_FENCE, dispatch, isAuthenticated: true };
    getAction("save-to-code")!.run(ctx as never);
    const data = overlayData(dispatch, "saveToCode");
    expect(data.initialContent).not.toContain("__kind");
    expect(data.initialContent).toContain("Mitochondria");
  });

  it("a plain code fence is unchanged", () => {
    expect(extractFirstCodeBlock("x\n```ts\nlet a;\n```")).toEqual({
      code: "let a;\n",
      language: "ts",
      found: true,
    });
  });
});
