import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

const captureErrorMock = captureError as jest.MockedFunction<typeof captureError>;

describe("bare JSON structural brace tracking", () => {
  beforeEach(() => captureErrorMock.mockClear());

  it("does not close a kind block on a brace inside string content", () => {
    const source = JSON.stringify(
      {
        __kind: "competitor_page_autopsy_v1",
        analyst_version: "competitor-autopsy-v1",
        competitor_domain: "example.com",
        competitor_url: "https://example.com/",
        own_page_id: "96a95f35-9ae8-4833-b30f-e57dfb383e32",
        own_page_url: "https://owned.example/page",
        topic: "A competitor summary containing } structural-looking text",
        findings: ["The remaining fields must stay in this object."],
      },
      null,
      2,
    );
    const blocks = new Map<string, RenderBlockPayload>();
    const accumulator = new StreamBlockAccumulator("brace-string-repro", ((payload: {
      requestId: string;
      block: RenderBlockPayload;
    }) => ({ type: "test/upsert", payload })) as never);
    const dispatch = (action: unknown) => {
      const block = (action as { payload?: { block?: RenderBlockPayload } }).payload
        ?.block;
      if (block) blocks.set(block.blockId, block);
      return action;
    };

    for (let offset = 0; offset < source.length; offset += 17) {
      accumulator.ingest(source.slice(offset, offset + 17), dispatch);
    }
    accumulator.finalize(dispatch);

    const completed = [...blocks.values()].filter(
      (block) => block.status === "complete" && block.content?.trim(),
    );
    expect(completed).toHaveLength(1);
    expect(JSON.parse(completed[0]!.content!)).toEqual(JSON.parse(source));
    expect(completed[0]!.metadata?.__ir).toMatchObject({
      root: { kind: "competitor_page_autopsy_v1", status: "complete" },
    });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
