/**
 * Every artifact type attaches (rendered-output P2 WP4): each type's
 * representations, its one-click default, and the wire — saved items by
 * reference, unsaved blocks inline, nothing in user_input.
 */
jest.mock("@/features/canvas/output/printPage", () => ({ printPublishedPage: jest.fn() }));

import { ARTIFACT_ATTACH, artifactAttachOptions, artifactBody, attachArtifactToChat } from "../artifactAttach";
import { renderedArtifactContextEntry } from "@ai-matrx/chat/agents/utils/renderedArtifactContext";
import type { RenderedArtifactSource } from "@ai-matrx/chat/agents/utils/renderedArtifactContext";
import type { CanvasContentType } from "@/features/canvas/canvasContent";

const attachSpy = jest.fn(async (..._args: unknown[]) => true);
jest.mock("@ai-matrx/chat/agents/components/inputs/resources/useAttachRenderedArtifact", () => ({
  attachRenderedArtifact: (...args: unknown[]) => attachSpy(...args),
}));

const values = (type: string, data: unknown) => artifactAttachOptions(type, data).map((o) => o.value);

describe("artifact attach representations", () => {
  it("every artifact type has an entry and at least a content representation", () => {
    for (const type of Object.keys(ARTIFACT_ATTACH) as CanvasContentType[]) {
      const options = artifactAttachOptions(type, { a: 1 });
      expect(options.some((o) => o.value === "code")).toBe(true);
      expect(options.some((o) => o.value === "screenshot")).toBe(true);
    }
  });

  it("a table / quiz / mermaid / code block offer what the plan says, default first", () => {
    const table = { headers: ["City", "Pop"], rows: [["Paris", 2.1]] };
    expect(values("table", table)).toEqual(["code", "text", "screenshot"]);
    expect(artifactAttachOptions("table", table)[0].label).toBe("Data");
    expect(values("quiz", JSON.stringify({ __kind: "quiz_set", questions: [] }))).toEqual(["code", "text", "screenshot"]);
    expect(values("mermaid", "graph TD; A-->B")).toEqual(["code", "screenshot"]);
    expect(artifactAttachOptions("mermaid", "graph TD; A-->B")[0].label).toBe("Source");
    expect(values("code", "print(1)")).toEqual(["code", "screenshot"]);
    expect(artifactAttachOptions("code", "print(1)")[0].label).toBe("Code");
  });

  it("an image defaults to its screenshot; a frame type says its screenshot is not built", () => {
    expect(values("image", "https://x/y.png")[0]).toBe("screenshot");
    const map = artifactAttachOptions("map", { center: [0, 0] });
    expect(map[0].value).toBe("code");
    expect(map.find((o) => o.value === "screenshot")?.unavailable).toMatch(/^Screenshot /);
    // With the kind's own capture (WP3), the frame screenshot is offered.
    expect(artifactAttachOptions("map", { center: [0, 0] }, true).find((o) => o.value === "screenshot")?.unavailable).toBeUndefined();
  });

  it("the body is text as itself, structured data as JSON plus readable text", () => {
    expect(artifactBody("graph TD")).toEqual({ code: "graph TD", text: null });
    const quiz = artifactBody('{"title":"Capitals"}');
    expect(quiz.code).toContain('"title": "Capitals"');
    expect(quiz.text).toBe("title: Capitals");
  });
});

describe("attachArtifactToChat — the wire", () => {
  beforeEach(() => attachSpy.mockClear());
  const store = { dispatch: jest.fn(), getState: () => ({}) } as never;

  it("an unsaved block attaches inline; its context entry carries the content, not user_input", async () => {
    await attachArtifactToChat({
      store,
      conversationId: "conv",
      type: "table",
      title: "Prices",
      data: { rows: [["a", 1]] },
      blockKey: "msg_2_table",
      representation: "text",
      element: () => null,
    });
    const [, conversationId, args] = attachSpy.mock.calls[0] as [unknown, string, { source: RenderedArtifactSource; representation: string }];
    expect(conversationId).toBe("conv");
    expect(args.source.record_type).toBe("inline");
    expect(args.representation).toBe("text");
    const entry = renderedArtifactContextEntry(args.source, "text");
    expect(entry?.key).toBe("artifact_msg_2_table_text");
    expect(entry?.reference).toContain("rows:");
  });

  it("a saved item attaches by canvas_item reference with its options", async () => {
    await attachArtifactToChat({
      store,
      conversationId: "conv",
      type: "mermaid",
      title: "Flow",
      data: "graph TD; A-->B",
      canvasItemId: "83541512-82ef-47dd-a277-74e00ec0aee8",
      blockKey: "x",
      representation: "code",
      element: () => null,
    });
    const args = (attachSpy.mock.calls[0] as [unknown, string, { source: RenderedArtifactSource }])[2];
    expect(args.source).toMatchObject({ record_type: "canvas_item", artifact_type: "mermaid" });
    expect(renderedArtifactContextEntry(args.source, "code")?.reference).toMatchObject({
      resource_type: "canvas_item",
      representation: "content",
    });
  });
});
