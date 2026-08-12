import { readEnvelope } from "../core/envelope-read";
import { applyIrKindRoute } from "../react/kind-route";
import { progressDataRenderBlock } from "../redux/progress-data-block";

describe("progressDataRenderBlock", () => {
  it("promotes nested Content IR from a typed progress event", () => {
    const block = progressDataRenderBlock(
      {
        kind: "seo.ai_visibility_answer_received",
        engine: "gemini",
        content_ir: {
          __kind: "structured_info",
          title: "Gemini answered",
          description: "The provider response is ready.",
          sections: [
            {
              heading: "Live evidence",
              items: [{ label: "Citations", text: "7" }],
            },
          ],
        },
      },
      12,
      3,
    );

    expect(block).not.toBeNull();
    expect(block).toMatchObject({
      blockId: "progress_content_ir_12",
      blockIndex: 3,
      type: "structured_info",
      status: "complete",
    });
    expect(block?.data?.content).toContain("**Gemini answered**");
    expect(block?.data?.content).toContain("* **Citations:** 7");
    expect(readEnvelope(block?.metadata)?.root).toMatchObject({
      kind: "structured_info",
      kindState: "resolved",
      status: "complete",
      value: {
        __kind: "structured_info",
        title: "Gemini answered",
      },
    });

    const routed = applyIrKindRoute({
      type: block?.type ?? "",
      serverData: block?.data ?? undefined,
      metadata: block?.metadata,
    });
    expect(routed.type).toBe("structured_info");
    expect(routed.serverData?.content).toContain("**Gemini answered**");
    expect(routed.serverData?.content).toContain("* **Citations:** 7");
  });

  it("leaves ordinary data events on their existing path", () => {
    expect(
      progressDataRenderBlock(
        { kind: "seo.command_run", run_id: "run-1" },
        1,
        0,
      ),
    ).toBeNull();
  });

  it("rejects malformed Content IR without inventing a kind", () => {
    expect(
      progressDataRenderBlock({ content_ir: { title: "Missing kind" } }, 1, 0),
    ).toBeNull();
  });
});
